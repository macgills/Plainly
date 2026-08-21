package dev.plainly.core

object TextNormalization {
    private val whitespace = Regex("\\s+")

    fun normalize(text: String): String = text.replace(whitespace, " ").trim()
}
