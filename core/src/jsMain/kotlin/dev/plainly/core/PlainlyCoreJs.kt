@file:OptIn(ExperimentalJsExport::class)

import dev.plainly.core.AdjustedBlock
import dev.plainly.core.AdjustmentEvent
import dev.plainly.core.AdjustmentResponse
import dev.plainly.core.AdjustmentSession
import dev.plainly.core.BlockFactory
import dev.plainly.core.BlockKey
import dev.plainly.core.DibelsMazeAssessment
import dev.plainly.core.DibelsPeriod
import dev.plainly.core.PageSnapshot
import dev.plainly.core.ReadingScheme
import dev.plainly.core.ReadingTarget
import dev.plainly.core.ReadingTargetProfile
import dev.plainly.core.ReadingTargets
import dev.plainly.core.SourceBlock
import dev.plainly.core.TextNormalization

@JsExport
class PlainlySourceBlockJs(
    val key: String,
    val text: String,
    val order: Int,
)

@JsExport
class PlainlyDecisionJs(
    val key: String,
    val state: String,
    val text: String?,
    val reason: String?,
)

@JsExport
class PlainlyReadingSchemeJs(
    val id: String,
    val name: String,
    val levels: Array<String>,
    val disclaimer: String,
)

@JsExport
class PlainlyDibelsPeriodJs(
    val id: String,
    val name: String,
)

@JsExport
class PlainlyDibelsRecommendationJs(
    val band: String,
    val benchmarkLabel: String,
    val support: String,
    val assessedGrade: String,
    val accessGrade: String,
    val lexile: String,
    val fountasPinnell: String,
    val oxford: String,
)

@JsExport
class PlainlyReadingTargetJs(
    val schemeId: String,
    val schemeName: String,
    val level: String,
    val label: String,
    val guidance: String,
    val disclaimer: String,
    val recommendation: PlainlyDibelsRecommendationJs?,
)

@JsExport
class PlainlySessionJs(
    url: String,
    title: String,
    scheme: String,
    level: String,
    dibelsPeriod: String,
    dibelsScore: String,
    texts: Array<String>,
    firstBatchSize: Int,
    batchSize: Int,
) {
    private val page = PageSnapshot(
        url = url,
        title = title,
        blocks = BlockFactory.fromTexts(texts.toList()),
    )
    private val session = AdjustmentSession(
        page = page,
        readingTarget = parseReadingTarget(scheme, level, dibelsPeriod, dibelsScore),
        firstBatchSize = firstBatchSize,
        batchSize = batchSize,
    )

    fun sourceBlocks(): Array<PlainlySourceBlockJs> =
        page.blocks.map(SourceBlock::toJs).toTypedArray()

    fun nextBatch(): Array<PlainlySourceBlockJs> =
        session.nextRequest()?.blocks?.map(SourceBlock::toJs)?.toTypedArray() ?: emptyArray()

    fun accept(keys: Array<String>, texts: Array<String>): Array<PlainlyDecisionJs> {
        require(keys.size == texts.size) { "Adjusted keys and texts must have the same size" }
        val response = AdjustmentResponse(
            keys.indices.map { index ->
                AdjustedBlock(
                    key = BlockKey(keys[index]),
                    text = TextNormalization.normalize(texts[index]),
                )
            },
        )
        return session.accept(response).map(AdjustmentEvent::toJs).toTypedArray()
    }

    fun fail(reason: String): Array<PlainlyDecisionJs> =
        session.fail(reason).map(AdjustmentEvent::toJs).toTypedArray()

    fun isComplete(): Boolean = session.isComplete
}

@JsExport
object PlainlyCoreJs {
    fun normalizeText(text: String): String = TextNormalization.normalize(text)

    fun readingSchemes(): Array<PlainlyReadingSchemeJs> = ReadingScheme.entries
        .map { scheme ->
            PlainlyReadingSchemeJs(
                id = scheme.id,
                name = scheme.displayName,
                levels = ReadingTargets.levels(scheme).toTypedArray(),
                disclaimer = scheme.disclaimer,
            )
        }
        .toTypedArray()

    fun dibelsPeriods(): Array<PlainlyDibelsPeriodJs> = DibelsPeriod.entries
        .map { PlainlyDibelsPeriodJs(it.id, it.displayName) }
        .toTypedArray()

    fun defaultReadingTarget(): PlainlyReadingTargetJs =
        ReadingTargets.resolve(ReadingTarget.Default).toJs()

    fun resolveReadingTarget(
        scheme: String,
        level: String,
        dibelsPeriod: String,
        dibelsScore: String,
    ): PlainlyReadingTargetJs = ReadingTargets
        .resolve(parseReadingTarget(scheme, level, dibelsPeriod, dibelsScore))
        .toJs()

    fun createSession(
        url: String,
        title: String,
        scheme: String,
        level: String,
        dibelsPeriod: String,
        dibelsScore: String,
        texts: Array<String>,
        firstBatchSize: Int,
        batchSize: Int,
    ): PlainlySessionJs = PlainlySessionJs(
        url = url,
        title = title,
        scheme = scheme,
        level = level,
        dibelsPeriod = dibelsPeriod,
        dibelsScore = dibelsScore,
        texts = texts,
        firstBatchSize = firstBatchSize,
        batchSize = batchSize,
    )
}

private fun parseReadingTarget(
    schemeId: String,
    level: String,
    dibelsPeriod: String,
    dibelsScore: String,
): ReadingTarget {
    val scheme = ReadingScheme.fromId(schemeId)
    val assessment = if (scheme == ReadingScheme.DibelsMaze && dibelsScore.isNotBlank()) {
        DibelsMazeAssessment(
            period = DibelsPeriod.fromId(dibelsPeriod),
            score = requireNotNull(dibelsScore.toDoubleOrNull()) { "Invalid DIBELS Maze score" },
        )
    } else {
        null
    }
    return ReadingTarget(scheme = scheme, level = level, assessment = assessment)
}

private fun ReadingTargetProfile.toJs(): PlainlyReadingTargetJs {
    val recommendationJs = recommendation?.let {
        PlainlyDibelsRecommendationJs(
            band = it.band.id,
            benchmarkLabel = it.band.benchmarkLabel,
            support = it.band.support,
            assessedGrade = it.assessedGrade,
            accessGrade = it.accessGrade,
            lexile = it.crosswalk.lexile,
            fountasPinnell = it.crosswalk.fountasPinnell,
            oxford = it.crosswalk.oxford,
        )
    }
    return PlainlyReadingTargetJs(
        schemeId = scheme.id,
        schemeName = scheme.displayName,
        level = level,
        label = label,
        guidance = guidance,
        disclaimer = disclaimer,
        recommendation = recommendationJs,
    )
}

private fun SourceBlock.toJs(): PlainlySourceBlockJs = PlainlySourceBlockJs(
    key = key.value,
    text = text,
    order = order,
)

private fun AdjustmentEvent.toJs(): PlainlyDecisionJs = when (this) {
    is AdjustmentEvent.Ready -> PlainlyDecisionJs(
        key = source.key.value,
        state = "ready",
        text = adjusted.text,
        reason = null,
    )

    is AdjustmentEvent.Rejected -> PlainlyDecisionJs(
        key = source.key.value,
        state = "rejected",
        text = null,
        reason = issues.joinToString("; ") { issue -> issue.message },
    )

    is AdjustmentEvent.Failed -> PlainlyDecisionJs(
        key = blocks.firstOrNull()?.key?.value ?: "",
        state = "failed",
        text = null,
        reason = reason,
    )

    is AdjustmentEvent.Pending,
    AdjustmentEvent.Complete,
    -> error("Pending and Complete are not JS response decisions")
}

fun main() = Unit
