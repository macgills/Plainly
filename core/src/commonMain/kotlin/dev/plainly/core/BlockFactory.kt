package dev.plainly.core

object BlockFactory {
    fun fromTexts(
        texts: List<String>,
        kind: BlockKind = BlockKind.Paragraph,
        minimumLength: Int = 1,
    ): List<SourceBlock> {
        require(minimumLength >= 0) { "Minimum length must be non-negative" }

        val occurrences = mutableMapOf<String, Int>()
        return texts.mapNotNull { rawText ->
            val normalized = TextNormalization.normalize(rawText)
            if (normalized.length < minimumLength) return@mapNotNull null

            val occurrence = occurrences.getOrElse(normalized) { 0 }
            occurrences[normalized] = occurrence + 1

            SourceBlock(
                key = BlockIdentity.from(normalized, occurrence),
                text = normalized,
                order = occurrences.values.sum() - 1,
                kind = kind,
            )
        }.mapIndexed { index, block -> block.copy(order = index) }
    }
}
