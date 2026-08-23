package dev.plainly.core

enum class ReadingScheme(
    val id: String,
    val displayName: String,
    val disclaimer: String,
) {
    Oxford(
        id = "oxford",
        displayName = "Oxford Reading Tree",
        disclaimer = "Plainly targets Oxford language demands; it does not officially level a webpage.",
    ),
    FountasPinnell(
        id = "fountasPinnell",
        displayName = "Fountas & Pinnell",
        disclaimer = "Plainly targets F&P text characteristics; it does not assign an official F&P level.",
    ),
    DibelsMaze(
        id = "dibelsMaze",
        displayName = "DIBELS 8 — Maze",
        disclaimer = "DIBELS Maze is a comprehension assessment, not a text-leveling scheme. Plainly uses grade, benchmark period and Maze score to recommend a language-access target; cross-scheme ranges are approximate rather than official conversions.",
    ),
    ;

    companion object {
        fun fromId(id: String): ReadingScheme =
            entries.firstOrNull { it.id == id } ?: error("Unsupported Plainly reading scheme: $id")
    }
}

enum class DibelsPeriod(
    val id: String,
    val displayName: String,
) {
    Beginning("beginning", "Beginning of year"),
    Middle("middle", "Middle of year"),
    End("end", "End of year"),
    ;

    companion object {
        fun fromId(id: String): DibelsPeriod =
            entries.firstOrNull { it.id == id } ?: error("Unsupported DIBELS benchmark period: $id")
    }
}

enum class DibelsBand(
    val id: String,
    val benchmarkLabel: String,
    val support: String,
    val gradeShift: Int,
) {
    Blue("blue", "Above Benchmark", "Core support · negligible risk", 0),
    Green("green", "At Benchmark", "Core support · minimal risk", 0),
    Yellow("yellow", "Below Benchmark", "Strategic support · some risk", -1),
    Red("red", "Well Below Benchmark", "Intensive support · at risk", -2),
}

data class DibelsMazeAssessment(
    val period: DibelsPeriod,
    val score: Double,
) {
    init {
        require(score.isFinite() && score >= 0.0) { "DIBELS Maze score must be a non-negative number" }
    }
}

data class ReadingTarget(
    val scheme: ReadingScheme,
    val level: String,
    val assessment: DibelsMazeAssessment? = null,
) {
    init {
        require(level in ReadingTargets.levels(scheme)) { "Unsupported ${scheme.displayName} level: $level" }
        require(scheme == ReadingScheme.DibelsMaze || assessment == null) {
            "Only DIBELS Maze targets can include an assessment"
        }
    }

    companion object {
        val Default = ReadingTarget(ReadingScheme.Oxford, "8")
    }
}

data class ApproximateCrosswalk(
    val lexile: String,
    val fountasPinnell: String,
    val oxford: String,
)

data class DibelsRecommendation(
    val band: DibelsBand,
    val assessedGrade: String,
    val accessGrade: String,
    val crosswalk: ApproximateCrosswalk,
)

data class ReadingTargetProfile(
    val scheme: ReadingScheme,
    val level: String,
    val label: String,
    val guidance: String,
    val disclaimer: String,
    val recommendation: DibelsRecommendation? = null,
)

object ReadingTargets {
    private val oxfordLevels = listOf("1", "1+") + (2..20).map(Int::toString)
    private val fountasPinnellLevels = ('A'..'Z').map(Char::toString)
    private val dibelsMazeGrades = (2..8).map(Int::toString)

    private data class MazeThresholds(
        val blue: Double,
        val green: Double,
        val yellow: Double,
    )

    private val dibelsMazeBenchmarks = mapOf(
        "2" to mapOf(
            DibelsPeriod.Beginning to MazeThresholds(11.0, 5.0, 2.5),
            DibelsPeriod.Middle to MazeThresholds(14.5, 9.0, 6.5),
            DibelsPeriod.End to MazeThresholds(18.0, 9.5, 7.0),
        ),
        "3" to mapOf(
            DibelsPeriod.Beginning to MazeThresholds(15.0, 8.0, 5.0),
            DibelsPeriod.Middle to MazeThresholds(20.5, 12.0, 9.5),
            DibelsPeriod.End to MazeThresholds(22.5, 15.5, 12.0),
        ),
        "4" to mapOf(
            DibelsPeriod.Beginning to MazeThresholds(21.0, 14.5, 11.0),
            DibelsPeriod.Middle to MazeThresholds(23.5, 16.5, 13.0),
            DibelsPeriod.End to MazeThresholds(28.0, 17.0, 14.0),
        ),
        "5" to mapOf(
            DibelsPeriod.Beginning to MazeThresholds(20.0, 13.5, 10.5),
            DibelsPeriod.Middle to MazeThresholds(27.0, 17.0, 14.5),
            DibelsPeriod.End to MazeThresholds(29.5, 21.0, 18.0),
        ),
        "6" to mapOf(
            DibelsPeriod.Beginning to MazeThresholds(23.0, 14.5, 12.5),
            DibelsPeriod.Middle to MazeThresholds(30.5, 19.5, 15.0),
            DibelsPeriod.End to MazeThresholds(33.5, 26.5, 20.5),
        ),
        "7" to mapOf(
            DibelsPeriod.Beginning to MazeThresholds(25.5, 20.0, 15.5),
            DibelsPeriod.Middle to MazeThresholds(33.0, 24.5, 18.0),
            DibelsPeriod.End to MazeThresholds(38.5, 29.5, 24.5),
        ),
        "8" to mapOf(
            DibelsPeriod.Beginning to MazeThresholds(24.5, 20.0, 16.5),
            DibelsPeriod.Middle to MazeThresholds(32.0, 26.0, 19.5),
            DibelsPeriod.End to MazeThresholds(38.0, 28.0, 24.5),
        ),
    )

    private val accessCrosswalk = mapOf(
        "2" to ApproximateCrosswalk("420–650L", "J–M", "7–9"),
        "3" to ApproximateCrosswalk("520–820L", "L–P", "8–11"),
        "4" to ApproximateCrosswalk("640–940L", "N–S", "10–13"),
        "5" to ApproximateCrosswalk("730–1010L", "Q–T", "12–14"),
        "6" to ApproximateCrosswalk("800–1080L", "S–V", "13–16"),
        "7" to ApproximateCrosswalk("850–1140L", "U–W", "15–17"),
        "8" to ApproximateCrosswalk("900–1200L", "V–Z", "16–20"),
    )

    fun levels(scheme: ReadingScheme): List<String> = when (scheme) {
        ReadingScheme.Oxford -> oxfordLevels
        ReadingScheme.FountasPinnell -> fountasPinnellLevels
        ReadingScheme.DibelsMaze -> dibelsMazeGrades
    }

    fun resolve(target: ReadingTarget): ReadingTargetProfile = when (target.scheme) {
        ReadingScheme.Oxford -> ReadingTargetProfile(
            scheme = target.scheme,
            level = target.level,
            label = "Oxford ${target.level}",
            guidance = oxfordGuidance(target.level),
            disclaimer = target.scheme.disclaimer,
        )

        ReadingScheme.FountasPinnell -> ReadingTargetProfile(
            scheme = target.scheme,
            level = target.level,
            label = "F&P ${target.level}",
            guidance = fountasPinnellGuidance(target.level),
            disclaimer = target.scheme.disclaimer,
        )

        ReadingScheme.DibelsMaze -> dibelsMazeProfile(target)
    }

    fun classifyDibelsMaze(
        grade: String,
        period: DibelsPeriod,
        score: Double,
    ): DibelsBand {
        require(score.isFinite() && score >= 0.0) { "DIBELS Maze score must be a non-negative number" }
        val thresholds = requireNotNull(dibelsMazeBenchmarks[grade]?.get(period)) {
            "Unsupported DIBELS Maze grade or benchmark period"
        }
        return when {
            score >= thresholds.blue -> DibelsBand.Blue
            score >= thresholds.green -> DibelsBand.Green
            score >= thresholds.yellow -> DibelsBand.Yellow
            else -> DibelsBand.Red
        }
    }

    fun recommendFromDibelsMaze(
        grade: String,
        period: DibelsPeriod,
        score: Double,
    ): DibelsRecommendation {
        require(grade in dibelsMazeGrades) { "Unsupported DIBELS Maze grade: $grade" }
        val band = classifyDibelsMaze(grade, period, score)
        val accessGrade = (grade.toInt() + band.gradeShift).coerceIn(2, 8).toString()
        return DibelsRecommendation(
            band = band,
            assessedGrade = grade,
            accessGrade = accessGrade,
            crosswalk = requireNotNull(accessCrosswalk[accessGrade]),
        )
    }

    private fun dibelsMazeProfile(target: ReadingTarget): ReadingTargetProfile {
        val recommendation = target.assessment?.let { assessment ->
            recommendFromDibelsMaze(target.level, assessment.period, assessment.score)
        }
        val guidance = if (recommendation == null) {
            dibelsGradeGuidance(target.level)
        } else {
            val assessment = requireNotNull(target.assessment)
            "${dibelsGradeGuidance(recommendation.accessGrade)} The Grade ${target.level} ${assessment.period.displayName.lowercase()} Maze score of ${formatScore(assessment.score)} is ${recommendation.band.benchmarkLabel} in the DIBELS 8 benchmark bands. Plainly is using an approximate Grade ${recommendation.accessGrade} language-access target while preserving factual content."
        }
        return ReadingTargetProfile(
            scheme = target.scheme,
            level = target.level,
            label = "DIBELS Maze · Grade ${target.level}",
            guidance = guidance,
            disclaimer = target.scheme.disclaimer,
            recommendation = recommendation,
        )
    }

    private fun oxfordGuidance(level: String): String {
        val numeric = if (level == "1+") 1.5 else level.toDouble()
        return when {
            numeric <= 2 -> "Use extremely short direct sentences, very common concrete words, and explain essential subject words immediately when the source provides enough information to do so."
            numeric <= 5 -> "Use short straightforward sentences, familiar vocabulary, explicit connections, and very short paragraphs."
            numeric <= 8 -> "Use mostly short-to-medium sentences, common vocabulary, clear paragraph structure, and explain important curriculum vocabulary in context when supported by the source."
            numeric <= 12 -> "Allow moderate sentence length and varied syntax while making relationships explicit and keeping non-fiction easy to scan."
            numeric <= 16 -> "Retain moderately challenging vocabulary and technical terms, simplifying genuinely dense syntax while preserving nuance."
            else -> "Preserve sophisticated age-appropriate vocabulary, technical language, varied syntax, tone, uncertainty, and layered meaning; intervene mainly for clarity."
        }
    }

    private fun fountasPinnellGuidance(level: String): String = when (level.single() - 'A') {
        in 0..3 -> "Use extremely predictable language, very short sentences, common concrete words, direct statements, and immediate explanations of essential vocabulary when supported by the source."
        in 4..7 -> "Use short clear sentences, familiar vocabulary, explicit sequencing, short paragraphs, and simple contextual explanations."
        in 8..12 -> "Use straightforward but increasingly varied sentences, preserve important content vocabulary, and make text structure explicit."
        in 13..17 -> "Allow varied sentence structures and moderately challenging vocabulary while reducing dense clauses and unnecessary abstraction."
        in 18..21 -> "Retain complex ideas, technical vocabulary, varied syntax, nuance, and normal informational text structure; clarify avoidable difficulty."
        else -> "Preserve mature vocabulary, complex syntax, abstraction, technical terminology, tone, and nuance; make only minimal clarity adjustments."
    }

    private fun dibelsGradeGuidance(level: String): String = when (level.toInt()) {
        2 -> "Target comprehension-accessible Grade 2 web prose: use short direct sentences, highly familiar words, explicit sequencing, very short paragraphs, and simple explanations of essential subject words when supported by the source."
        3, 4 -> "Target comprehension-accessible upper-elementary prose: use clear sentence structure, accessible academic vocabulary, explicit relationships between ideas, and short-to-medium paragraphs."
        5, 6 -> "Target comprehension-accessible middle-grade prose: allow varied syntax and academic vocabulary while unpacking dense clauses and implicit logical connections, preserving technical terms and nuance."
        else -> "Target comprehension-accessible Grade 7–8 prose: retain complex ideas, academic and technical vocabulary, varied syntax, and nuance; simplify only avoidable processing barriers without reducing conceptual rigor."
    }

    private fun formatScore(score: Double): String =
        if (score % 1.0 == 0.0) score.toInt().toString() else score.toString()
}
