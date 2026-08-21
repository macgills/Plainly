@file:OptIn(ExperimentalJsExport::class)

import dev.plainly.core.AdjustedBlock
import dev.plainly.core.AdjustmentEvent
import dev.plainly.core.AdjustmentResponse
import dev.plainly.core.AdjustmentSession
import dev.plainly.core.BlockFactory
import dev.plainly.core.BlockKey
import dev.plainly.core.PageSnapshot
import dev.plainly.core.ReadingLevel
import dev.plainly.core.SourceBlock
import dev.plainly.core.TextNormalization

@JsExport
class PlainlySourceBlockJs(
    val key: String,
    val text: String,
    val order: Int,
)

@JsExport
class PlainlyDecisionJs(
    val key: String,
    val state: String,
    val text: String?,
    val reason: String?,
)

@JsExport
class PlainlySessionJs(
    url: String,
    title: String,
    level: Int,
    texts: Array<String>,
    firstBatchSize: Int,
    batchSize: Int,
) {
    private val page = PageSnapshot(
        url = url,
        title = title,
        blocks = BlockFactory.fromTexts(texts.toList()),
    )
    private val session = AdjustmentSession(
        page = page,
        readingLevel = ReadingLevel.of(level),
        firstBatchSize = firstBatchSize,
        batchSize = batchSize,
    )

    fun sourceBlocks(): Array<PlainlySourceBlockJs> =
        page.blocks.map(SourceBlock::toJs).toTypedArray()

    fun nextBatch(): Array<PlainlySourceBlockJs> =
        session.nextRequest()?.blocks?.map(SourceBlock::toJs)?.toTypedArray() ?: emptyArray()

    fun accept(keys: Array<String>, texts: Array<String>): Array<PlainlyDecisionJs> {
        require(keys.size == texts.size) { "Adjusted keys and texts must have the same size" }
        val response = AdjustmentResponse(
            keys.indices.map { index ->
                AdjustedBlock(
                    key = BlockKey(keys[index]),
                    text = TextNormalization.normalize(texts[index]),
                )
            },
        )
        return session.accept(response).map(AdjustmentEvent::toJs).toTypedArray()
    }

    fun fail(reason: String): Array<PlainlyDecisionJs> =
        session.fail(reason).map(AdjustmentEvent::toJs).toTypedArray()

    fun isComplete(): Boolean = session.isComplete
}

@JsExport
object PlainlyCoreJs {
    fun normalizeText(text: String): String = TextNormalization.normalize(text)

    fun isReadingLevelSupported(level: Int): Boolean = level in 1..5

    fun createSession(
        url: String,
        title: String,
        level: Int,
        texts: Array<String>,
        firstBatchSize: Int,
        batchSize: Int,
    ): PlainlySessionJs = PlainlySessionJs(
        url = url,
        title = title,
        level = level,
        texts = texts,
        firstBatchSize = firstBatchSize,
        batchSize = batchSize,
    )
}

private fun SourceBlock.toJs(): PlainlySourceBlockJs = PlainlySourceBlockJs(
    key = key.value,
    text = text,
    order = order,
)

private fun AdjustmentEvent.toJs(): PlainlyDecisionJs = when (this) {
    is AdjustmentEvent.Ready -> PlainlyDecisionJs(
        key = source.key.value,
        state = "ready",
        text = adjusted.text,
        reason = null,
    )

    is AdjustmentEvent.Rejected -> PlainlyDecisionJs(
        key = source.key.value,
        state = "rejected",
        text = null,
        reason = issues.joinToString("; ") { issue -> issue.message },
    )

    is AdjustmentEvent.Failed -> PlainlyDecisionJs(
        key = blocks.firstOrNull()?.key?.value ?: "",
        state = "failed",
        text = null,
        reason = reason,
    )

    is AdjustmentEvent.Pending,
    AdjustmentEvent.Complete,
    -> error("Pending and Complete are not JS response decisions")
}

fun main() = Unit
