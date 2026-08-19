package dev.plainly.core

sealed interface AdjustmentEvent {
    data class Pending(val blocks: List<SourceBlock>) : AdjustmentEvent

    data class Ready(
        val source: SourceBlock,
        val adjusted: AdjustedBlock,
    ) : AdjustmentEvent

    data class Rejected(
        val source: SourceBlock,
        val adjusted: AdjustedBlock,
        val issues: List<FidelityIssue>,
    ) : AdjustmentEvent

    data class Failed(
        val blocks: List<SourceBlock>,
        val reason: String,
    ) : AdjustmentEvent

    data object Complete : AdjustmentEvent
}

class AdjustmentEngine(
    private val provider: AdjustmentProvider,
    private val fidelityGuard: FidelityGuard = FidelityGuard(),
    private val firstBatchSize: Int = 1,
    private val batchSize: Int = 4,
) {
    init {
        require(firstBatchSize > 0) { "First batch size must be positive" }
        require(batchSize > 0) { "Batch size must be positive" }
    }

    suspend fun adjust(
        page: PageSnapshot,
        readingLevel: ReadingLevel,
        emit: (AdjustmentEvent) -> Unit,
    ) {
        val orderedBlocks = page.blocks.sortedBy(SourceBlock::order)
        if (orderedBlocks.isEmpty()) {
            emit(AdjustmentEvent.Complete)
            return
        }

        for (batch in planBatches(orderedBlocks)) {
            emit(AdjustmentEvent.Pending(batch))
            val response = try {
                provider.adjust(
                    AdjustmentRequest(
                        readingLevel = readingLevel,
                        pageUrl = page.url,
                        pageTitle = page.title,
                        blocks = batch,
                    ),
                )
            } catch (error: Throwable) {
                emit(AdjustmentEvent.Failed(batch, error.message ?: error::class.simpleName ?: "Adjustment failed"))
                continue
            }

            val adjustedByKey = response.blocks.associateBy(AdjustedBlock::key)
            for (source in batch) {
                val adjusted = adjustedByKey[source.key]
                if (adjusted == null) {
                    emit(AdjustmentEvent.Failed(listOf(source), "Provider omitted ${source.key.value}"))
                    continue
                }

                val issues = fidelityGuard.validate(source, adjusted)
                if (issues.isEmpty()) {
                    emit(AdjustmentEvent.Ready(source, adjusted))
                } else {
                    emit(AdjustmentEvent.Rejected(source, adjusted, issues))
                }
            }
        }

        emit(AdjustmentEvent.Complete)
    }

    internal fun planBatches(blocks: List<SourceBlock>): List<List<SourceBlock>> {
        if (blocks.isEmpty()) return emptyList()

        val firstEnd = minOf(firstBatchSize, blocks.size)
        val result = mutableListOf(blocks.subList(0, firstEnd))
        var cursor = firstEnd
        while (cursor < blocks.size) {
            val end = minOf(cursor + batchSize, blocks.size)
            result += blocks.subList(cursor, end)
            cursor = end
        }
        return result
    }
}
