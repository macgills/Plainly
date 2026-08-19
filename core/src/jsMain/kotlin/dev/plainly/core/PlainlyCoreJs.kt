package dev.plainly.core

@OptIn(ExperimentalJsExport::class)
@JsExport
object PlainlyCoreJs {
    fun normalizeText(text: String): String = TextNormalization.normalize(text)

    fun blockKey(text: String, occurrence: Int = 0): String =
        BlockIdentity.from(text, occurrence).value

    fun isReadingLevelSupported(level: Int): Boolean = level in 1..5
}
