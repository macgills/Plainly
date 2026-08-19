package dev.plainly.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class FidelityGuardTest {
    private val source = SourceBlock(
        key = BlockKey("example"),
        text = "The mission launched in 1969 and lasted 8 days.",
        order = 0,
    )

    @Test
    fun acceptsAdjustedTextThatPreservesNumbers() {
        val issues = FidelityGuard().validate(
            source,
            AdjustedBlock(source.key, "It launched in 1969. The mission lasted 8 days."),
        )

        assertTrue(issues.isEmpty())
    }

    @Test
    fun rejectsAdjustedTextThatDropsNumericFacts() {
        val issues = FidelityGuard().validate(
            source,
            AdjustedBlock(source.key, "The mission launched long ago and lasted several days."),
        )

        assertEquals("numeric_facts_changed", issues.single().code)
        assertTrue(issues.single().message.contains("1969"))
        assertTrue(issues.single().message.contains("8"))
    }

    @Test
    fun rejectsAdjustedTextThatInventsNumericFacts() {
        val issues = FidelityGuard().validate(
            source,
            AdjustedBlock(source.key, "It launched in 1969, lasted 8 days, and carried 3 people."),
        )

        assertEquals("numeric_facts_changed", issues.single().code)
        assertTrue(issues.single().message.contains("added: 3"))
    }
}
