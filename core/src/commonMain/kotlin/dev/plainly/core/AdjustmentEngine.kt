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
        val session = AdjustmentSession(
            page = page,
            readingLevel = readingLevel,
            fidelityGuard = fidelityGuard,
            firstBatchSize = firstBatchSize,
            batchSize = batchSize,
        )

        while (!session.isComplete) {
            val request = session.nextRequest() ?: break
            emit(AdjustmentEvent.Pending(request.blocks))

            val events = try {
                session.accept(provider.adjust(request))
            } catch (error: Throwable) {
                session.fail(error.message ?: error::class.simpleName ?: "Adjustment failed")
            }
            events.forEach(emit)
        }

        emit(AdjustmentEvent.Complete)
    }

    internal fun planBatches(blocks: List<SourceBlock>): List<List<SourceBlock>> =
        AdjustmentSession.planBatches(
            blocks = blocks,
            firstBatchSize = firstBatchSize,
            batchSize = batchSize,
        )
}
