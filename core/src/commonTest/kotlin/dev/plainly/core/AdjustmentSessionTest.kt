package dev.plainly.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertTrue

class AdjustmentSessionTest {
    @Test
    fun sessionOwnsViewportFirstBatchingAndResponseReconciliation() {
        val page = pageWithBlocks(7)
        val session = AdjustmentSession(page, ReadingLevel.of(2))
        val batchSizes = mutableListOf<Int>()
        var ready = 0

        while (!session.isComplete) {
            val request = requireNotNull(session.nextRequest())
            batchSizes += request.blocks.size
            assertFalse(session.isComplete)

            val events = session.accept(
                AdjustmentResponse(
                    request.blocks.map { source ->
                        AdjustedBlock(source.key, "Simpler ${source.text}")
                    },
                ),
            )
            ready += events.count { it is AdjustmentEvent.Ready }
        }

        assertEquals(listOf(1, 4, 2), batchSizes)
        assertEquals(7, ready)
        assertTrue(session.isComplete)
    }

    @Test
    fun rejectedTextDoesNotBecomeReady() {
        val source = SourceBlock(
            key = BlockIdentity.from("The mission launched in 1969 and returned in 1972."),
            text = "The mission launched in 1969 and returned in 1972.",
            order = 0,
        )
        val session = AdjustmentSession(
            PageSnapshot("https://example.test", "Example", listOf(source)),
            ReadingLevel.of(1),
        )

        requireNotNull(session.nextRequest())
        val event = session.accept(
            AdjustmentResponse(listOf(AdjustedBlock(source.key, "The mission launched long ago."))),
        ).single()

        assertIs<AdjustmentEvent.Rejected>(event)
        assertTrue(session.isComplete)
    }

    @Test
    fun failedBatchCanAdvanceToTheNextBatch() {
        val page = pageWithBlocks(3)
        val session = AdjustmentSession(page, ReadingLevel.of(2), batchSize = 2)

        val first = requireNotNull(session.nextRequest())
        assertEquals(1, first.blocks.size)
        val failure = session.fail("network down").single()
        assertIs<AdjustmentEvent.Failed>(failure)

        val second = requireNotNull(session.nextRequest())
        assertEquals(2, second.blocks.size)
        session.accept(
            AdjustmentResponse(second.blocks.map { AdjustedBlock(it.key, "Simpler ${it.text}") }),
        )
        assertTrue(session.isComplete)
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
