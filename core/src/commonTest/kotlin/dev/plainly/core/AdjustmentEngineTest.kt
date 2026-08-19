package dev.plainly.core

import kotlin.coroutines.Continuation
import kotlin.coroutines.EmptyCoroutineContext
import kotlin.coroutines.startCoroutine
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

class AdjustmentEngineTest {
    @Test
    fun firstBlockIsPrioritizedThenRemainingBlocksAreBatched() = runSuspending {
        val page = pageWithBlocks(7)
        val requests = mutableListOf<List<BlockKey>>()
        val events = mutableListOf<AdjustmentEvent>()
        val provider = AdjustmentProvider { request ->
            requests += request.blocks.map(SourceBlock::key)
            AdjustmentResponse(
                request.blocks.map { source ->
                    AdjustedBlock(source.key, "Simpler ${source.text}")
                },
            )
        }

        AdjustmentEngine(provider).adjust(page, ReadingLevel.of(2), events::add)

        assertEquals(listOf(1, 4, 2), requests.map { it.size })
        assertEquals(7, events.count { it is AdjustmentEvent.Ready })
        assertIs<AdjustmentEvent.Complete>(events.last())
    }

    @Test
    fun providerFailureFallsBackPerBatchAndProcessingContinues() = runSuspending {
        val page = pageWithBlocks(3)
        var calls = 0
        val events = mutableListOf<AdjustmentEvent>()
        val provider = AdjustmentProvider { request ->
            calls += 1
            if (calls == 1) error("network down")
            AdjustmentResponse(request.blocks.map { AdjustedBlock(it.key, "Simpler ${it.text}") })
        }

        AdjustmentEngine(provider, batchSize = 2).adjust(page, ReadingLevel.of(1), events::add)

        assertEquals(1, events.count { it is AdjustmentEvent.Failed })
        assertEquals(2, events.count { it is AdjustmentEvent.Ready })
        assertIs<AdjustmentEvent.Complete>(events.last())
    }

    @Test
    fun missingProviderBlockIsReportedAsFailure() = runSuspending {
        val page = pageWithBlocks(1)
        val events = mutableListOf<AdjustmentEvent>()
        val provider = AdjustmentProvider { AdjustmentResponse(emptyList()) }

        AdjustmentEngine(provider).adjust(page, ReadingLevel.of(2), events::add)

        val failure = events.filterIsInstance<AdjustmentEvent.Failed>().single()
        assertEquals(page.blocks, failure.blocks)
    }

    private fun pageWithBlocks(count: Int): PageSnapshot = PageSnapshot(
        url = "https://example.test/article",
        title = "Example",
        blocks = (0 until count).map { index ->
            val text = "Paragraph $index contains enough source text and keeps the number $index."
            SourceBlock(
                key = BlockIdentity.from(text),
                text = text,
                order = index,
            )
        },
    )
}

private fun <T> runSuspending(block: suspend () -> T): T {
    var outcome: Result<T>? = null
    block.startCoroutine(
        object : Continuation<T> {
            override val context = EmptyCoroutineContext
            override fun resumeWith(result: Result<T>) {
                outcome = result
            }
        },
    )
    return requireNotNull(outcome) { "Test coroutine unexpectedly suspended" }.getOrThrow()
}
