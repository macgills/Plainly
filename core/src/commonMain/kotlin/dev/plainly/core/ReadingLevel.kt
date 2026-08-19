package dev.plainly.core

data class ReadingLevel private constructor(val value: Int) {
    companion object {
        fun of(value: Int): ReadingLevel {
            require(value in 1..5) { "Reading level must be between 1 and 5" }
            return ReadingLevel(value)
        }
    }
}
