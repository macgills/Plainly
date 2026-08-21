package dev.plainly.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals

class BlockFactoryTest {
    @Test
    fun duplicateParagraphsRemainAddressable() {
        val blocks = BlockFactory.fromTexts(
            listOf(
                "Same paragraph.",
                "Same   paragraph.",
                "Different paragraph.",
            ),
        )

        assertEquals(3, blocks.size)
        assertNotEquals(blocks[0].key, blocks[1].key)
        assertEquals(listOf(0, 1, 2), blocks.map(SourceBlock::order))
    }
}
