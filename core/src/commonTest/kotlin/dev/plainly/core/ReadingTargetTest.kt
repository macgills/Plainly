package dev.plainly.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

class ReadingTargetTest {
    @Test
    fun exposesCompleteOxfordAndFountasPinnellRanges() {
        assertEquals(listOf("1", "1+", "2"), ReadingTargets.levels(ReadingScheme.Oxford).take(3))
        assertEquals("20", ReadingTargets.levels(ReadingScheme.Oxford).last())
        assertEquals(26, ReadingTargets.levels(ReadingScheme.FountasPinnell).size)
        assertEquals("A", ReadingTargets.levels(ReadingScheme.FountasPinnell).first())
        assertEquals("Z", ReadingTargets.levels(ReadingScheme.FountasPinnell).last())
        assertEquals((2..8).map(Int::toString), ReadingTargets.levels(ReadingScheme.DibelsMaze))
    }

    @Test
    fun grade4MiddleMazeUsesBenchmarkBoundaries() {
        assertEquals(DibelsBand.Blue, ReadingTargets.classifyDibelsMaze("4", DibelsPeriod.Middle, 24.0))
        assertEquals(DibelsBand.Green, ReadingTargets.classifyDibelsMaze("4", DibelsPeriod.Middle, 18.0))
        assertEquals(DibelsBand.Yellow, ReadingTargets.classifyDibelsMaze("4", DibelsPeriod.Middle, 14.0))
        assertEquals(DibelsBand.Red, ReadingTargets.classifyDibelsMaze("4", DibelsPeriod.Middle, 10.0))
    }

    @Test
    fun mazeRecommendationProducesConservativeAccessTargetAndCrosswalk() {
        val recommendation = ReadingTargets.recommendFromDibelsMaze("4", DibelsPeriod.Middle, 14.0)

        assertEquals(DibelsBand.Yellow, recommendation.band)
        assertEquals("3", recommendation.accessGrade)
        assertEquals("520–820L", recommendation.crosswalk.lexile)
        assertEquals("L–P", recommendation.crosswalk.fountasPinnell)
        assertEquals("8–11", recommendation.crosswalk.oxford)
    }

    @Test
    fun schemesResolveToDistinctPromptGuidanceAndLabels() {
        val oxford = ReadingTargets.resolve(ReadingTarget(ReadingScheme.Oxford, "8"))
        val fountasPinnell = ReadingTargets.resolve(ReadingTarget(ReadingScheme.FountasPinnell, "M"))
        val dibels = ReadingTargets.resolve(
            ReadingTarget(
                scheme = ReadingScheme.DibelsMaze,
                level = "4",
                assessment = DibelsMazeAssessment(DibelsPeriod.Middle, 14.0),
            ),
        )

        assertEquals("Oxford 8", oxford.label)
        assertEquals("F&P M", fountasPinnell.label)
        assertEquals("DIBELS Maze · Grade 4", dibels.label)
        assertNotEquals(oxford.guidance, fountasPinnell.guidance)
        assertTrue(dibels.guidance.contains("Grade 3 language-access target"))
        assertEquals("3", dibels.recommendation?.accessGrade)
    }

    @Test
    fun rejectsUnsupportedTargetsAndAssessments() {
        assertFailsWith<IllegalArgumentException> { ReadingTarget(ReadingScheme.Oxford, "21") }
        assertFailsWith<IllegalArgumentException> { ReadingTarget(ReadingScheme.FountasPinnell, "AA") }
        assertFailsWith<IllegalArgumentException> { DibelsMazeAssessment(DibelsPeriod.Middle, -1.0) }
    }
}
