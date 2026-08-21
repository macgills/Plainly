package dev.plainly.core

class AdjustmentSession(
    private val page: PageSnapshot,
    private val readingLevel: ReadingLevel,
    private val fidelityGuard: FidelityGuard = FidelityGuard(),
    firstBatchSize: Int = 1,
    batchSize: Int = 4,
) {
    private val batches: List<List<SourceBlock>> = planBatches(
        blocks = page.blocks.sortedBy(SourceBlock::order),
        firstBatchSize = firstBatchSize,
        batchSize = batchSize,
    )
    private var batchIndex = 0
    private var activeBatch: List<SourceBlock>? = null

    val isComplete: Boolean
        get() = activeBatch == null && batchIndex >= batches.size

    fun nextRequest(): AdjustmentRequest? {
        check(activeBatch == null) { "Resolve the active batch before requesting another" }
        if (batchIndex >= batches.size) return null

        val batch = batches[batchIndex]
        activeBatch = batch
        return AdjustmentRequest(
            readingLevel = readingLevel,
            pageUrl = page.url,
            pageTitle = page.title,
            blocks = batch,
        )
    }

    fun accept(response: AdjustmentResponse): List<AdjustmentEvent> {
        val batch = requireActiveBatch()
        finishActiveBatch()

        val adjustedByKey = response.blocks.associateBy(AdjustedBlock::key)
        return batch.map { source ->
            val adjusted = adjustedByKey[source.key]
            if (adjusted == null) {
                AdjustmentEvent.Failed(listOf(source), "Provider omitted ${source.key.value}")
            } else {
                val issues = fidelityGuard.validate(source, adjusted)
                if (issues.isEmpty()) {
                    AdjustmentEvent.Ready(source, adjusted)
                } else {
                    AdjustmentEvent.Rejected(source, adjusted, issues)
                }
            }
        }
    }

    fun fail(reason: String): List<AdjustmentEvent> {
        val batch = requireActiveBatch()
        finishActiveBatch()
        return listOf(AdjustmentEvent.Failed(batch, reason.ifBlank { "Adjustment failed" }))
    }

    private fun requireActiveBatch(): List<SourceBlock> =
        checkNotNull(activeBatch) { "No adjustment batch is active" }

    private fun finishActiveBatch() {
        activeBatch = null
        batchIndex += 1
    }

    companion object {
        internal fun planBatches(
            blocks: List<SourceBlock>,
            firstBatchSize: Int,
            batchSize: Int,
        ): List<List<SourceBlock>> {
            require(firstBatchSize > 0) { "First batch size must be positive" }
            require(batchSize > 0) { "Batch size must be positive" }
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
}
