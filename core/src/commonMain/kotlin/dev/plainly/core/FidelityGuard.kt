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
        val sourceNumbers = numberToken.findAll(source.text).map { it.value }.toSet()
        val adjustedNumbers = numberToken.findAll(adjusted.text).map { it.value }.toSet()
        if (sourceNumbers == adjustedNumbers) return null

        val missing = sourceNumbers - adjustedNumbers
        val added = adjustedNumbers - sourceNumbers
        val details = buildList {
            if (missing.isNotEmpty()) add("removed: ${missing.sorted().joinToString()}")
            if (added.isNotEmpty()) add("added: ${added.sorted().joinToString()}")
        }.joinToString("; ")

        return FidelityIssue(
            code = "numeric_facts_changed",
            message = "Adjusted text changed numeric facts ($details)",
        )
    }
}
