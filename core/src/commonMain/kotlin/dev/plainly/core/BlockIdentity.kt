package dev.plainly.core

data class BlockKey(val value: String)

object BlockIdentity {
    fun from(sourceText: String, occurrence: Int = 0): BlockKey {
        require(occurrence >= 0) { "Occurrence must be non-negative" }
        val normalized = TextNormalization.normalize(sourceText)
        require(normalized.isNotEmpty()) { "A block cannot be identified from blank text" }

        var hash = 0x811c9dc5u
        for (byte in normalized.encodeToByteArray()) {
            hash = (hash xor byte.toUByte().toUInt()) * 0x01000193u
        }

        val fingerprint = hash.toString(16).padStart(8, '0')
        return BlockKey("$fingerprint-$occurrence")
    }
}
