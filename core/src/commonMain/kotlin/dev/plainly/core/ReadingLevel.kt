package dev.plainly.core

data class ReadingLevel(val value: Int) {
    init {
        require(value in 1..5) { "Reading level must be between 1 and 5" }
    }

    companion object {
        fun of(value: Int): ReadingLevel = ReadingLevel(value)
    }
}
