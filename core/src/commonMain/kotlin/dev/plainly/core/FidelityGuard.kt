package dev.plainly.core

data class FidelityIssue(
    val code: String,
    val message: String,
)

fun interface FidelityRule {
    fun validate(source: SourceBlock, adjusted: AdjustedBlock): FidelityIssue?
}

class FidelityGuard(
    private val rules: List<FidelityRule> = listOf(NumbersPreservedRule),
) {
    fun validate(source: SourceBlock, adjusted: AdjustedBlock): List<FidelityIssue> =
        rules.mapNotNull { it.validate(source, adjusted) }
}

object NumbersPreservedRule : FidelityRule {
    private val numberToken = Regex("\\d+(?:[.,:/-]\\d+)*(?:%)?")

    override fun validate(source: SourceBlock, adjusted: AdjustedBlock): FidelityIssue? {
        val sourceNumbers = numberToken.findAll(source.text).map { it.value }.toList()
        val adjustedNumbers = numberToken.findAll(adjusted.text).map { it.value }.toList()
        val missing = sourceNumbers.filterNot { it in adjustedNumbers }
        return if (missing.isEmpty()) {
            null
        } else {
            FidelityIssue(
                code = "numbers_removed",
                message = "Adjusted text removed numeric facts: ${missing.joinToString()}",
            )
        }
    }
}
