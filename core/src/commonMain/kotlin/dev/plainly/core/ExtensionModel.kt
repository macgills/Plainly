package dev.plainly.core

enum class BlockKind {
    Paragraph,
    ListItem,
    Heading,
    Other,
}

data class SourceBlock(
    val key: BlockKey,
    val text: String,
    val order: Int,
    val kind: BlockKind = BlockKind.Paragraph,
)

data class PageSnapshot(
    val url: String,
    val title: String,
    val blocks: List<SourceBlock>,
)

data class AdjustmentRequest(
    val readingLevel: ReadingLevel,
    val pageUrl: String,
    val pageTitle: String,
    val blocks: List<SourceBlock>,
)

data class AdjustedBlock(
    val key: BlockKey,
    val text: String,
)

data class AdjustmentResponse(
    val blocks: List<AdjustedBlock>,
)

fun interface AdjustmentProvider {
    suspend fun adjust(request: AdjustmentRequest): AdjustmentResponse
}
