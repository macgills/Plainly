package dev.plainly.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals

class BlockIdentityTest {
    @Test
    fun whitespaceDoesNotChangeBlockIdentity() {
        val compact = BlockIdentity.from("Plants make food from light.")
        val noisy = BlockIdentity.from("  Plants   make food\nfrom light.  ")

        assertEquals(compact, noisy)
    }

    @Test
    fun duplicateTextGetsDistinctOccurrenceIdentity() {
        val first = BlockIdentity.from("Repeated paragraph", occurrence = 0)
        val second = BlockIdentity.from("Repeated paragraph", occurrence = 1)

        assertNotEquals(first, second)
    }
}
