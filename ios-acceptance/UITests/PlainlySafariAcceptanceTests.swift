import XCTest

@MainActor
final class PlainlySafariAcceptanceTests: XCTestCase {
    private let settings = XCUIApplication(bundleIdentifier: "com.apple.Preferences")
    private let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
    private let wikipedia = URL(string: "https://en.wikipedia.org/wiki/Photosynthesis")!

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @MainActor
    override func tearDown() async throws {
        if testRun?.hasSucceeded == false {
            keep(XCUIScreen.main.screenshot(), name: "failure")
            keep(settings.debugDescription, name: "settings-accessibility")
            keep(safari.debugDescription, name: "safari-accessibility")
        }
        try await super.tearDown()
    }

    func testPlainlyTransformsWikipediaInNormalIPadSafari() throws {
        let apiKey = try XCTUnwrap(
            ProcessInfo.processInfo.environment["AI_SECRET"],
            "AI_SECRET must be passed to the XCTest runner",
        )
        XCTAssertGreaterThan(apiKey.count, 20)

        enablePlainlyInSafariSettings()
        openWikipedia()
        configurePlainly(apiKey: apiKey)
        openWikipedia()
        allowWebsiteAccessIfPrompted()

        let outcomeIndicator = safari.descendants(matching: .any)
            .matching(NSPredicate(
                format: "label CONTAINS %@ AND (label CONTAINS %@ OR label CONTAINS %@)",
                "Plainly",
                "Oxford 8",
                "Couldn",
            ))
            .firstMatch
        XCTAssertTrue(
            outcomeIndicator.waitForExistence(timeout: 75),
            "Plainly never exposed an adjusted or error state in normal iPad Safari",
        )
        XCTAssertTrue(
            outcomeIndicator.label.contains("Oxford 8"),
            "Plainly entered its Couldn't-adjust state instead of transforming the article",
        )

        outcomeIndicator.tap()
        XCTAssertTrue(
            find("Plainly · Original", in: safari).waitForExistence(timeout: 5),
            "Plainly indicator could not restore the source text",
        )
        XCTAssertTrue(tap("Plainly · Original", in: safari, timeout: 5))
        XCTAssertTrue(outcomeIndicator.waitForExistence(timeout: 5))

        keep(XCUIScreen.main.screenshot(), name: "plainly-adjusted-wikipedia")
    }

    private func enablePlainlyInSafariSettings() {
        settings.terminate()
        settings.launch()

        if tap("Apps", in: settings, timeout: 5) {
            // On iPad the Apps pane virtualizes its alphabetic list. Searching it is both
            // faster and substantially more reliable under XCUITest than probing absent
            // typed elements while scrolling.
            let searchApps = settings.searchFields["Search Apps"].firstMatch
            XCTAssertTrue(searchApps.waitForExistence(timeout: 5), "Settings > Apps search field was unavailable")
            searchApps.tap()
            searchApps.typeText("Safari")

            let safariRow = settings.cells.containing(.staticText, identifier: "Safari").firstMatch
            XCTAssertTrue(safariRow.waitForExistence(timeout: 5), "Safari was not found in Settings > Apps")
            tapCenter(safariRow)
        } else {
            let search = settings.searchFields.firstMatch
            XCTAssertTrue(search.waitForExistence(timeout: 5), "Settings search field was unavailable")
            search.tap()
            search.typeText("Safari")
            XCTAssertTrue(tap("Safari", in: settings, timeout: 5), "Safari settings were not found")
        }

        XCTAssertTrue(scrollAndTap("Extensions", in: settings), "Safari Extensions settings were not found")
        XCTAssertTrue(scrollAndTap("Plainly", in: settings), "Installed Plainly extension was not listed by Safari")

        let extensionSwitch = settings.switches.firstMatch
        XCTAssertTrue(extensionSwitch.waitForExistence(timeout: 5), "Plainly enable switch was not available")
        enable(extensionSwitch)

        grantWebsiteAccessIfPresent()
    }

    private func grantWebsiteAccessIfPresent() {
        // Safari treats MV3 host permissions as user-controlled website access. Plainly
        // needs both the page host for its content script and api.openai.com for the
        // background fetch. Granting only Wikipedia lets the UI run but blocks adjustment.
        if grantWebsiteAccess("All Websites") {
            return
        }

        for site in ["en.wikipedia.org", "api.openai.com"] {
            _ = grantWebsiteAccess(site)
        }
    }

    private func grantWebsiteAccess(_ site: String) -> Bool {
        guard tap(site, in: settings, timeout: 1) else { return false }
        return tap("Allow", in: settings, timeout: 2)
            || tap("Always Allow", in: settings, timeout: 2)
    }

    private func openWikipedia() {
        safari.launch()
        safari.open(wikipedia)
        XCTAssertTrue(
            find("Photosynthesis", in: safari).waitForExistence(timeout: 20),
            "Safari did not load the Wikipedia article",
        )
    }

    private func configurePlainly(apiKey: String) {
        if !tap("Plainly", in: safari, timeout: 2) {
            if !tap("Extensions", in: safari, timeout: 2) {
                XCTAssertTrue(
                    tap("Page Menu", in: safari, timeout: 2) || tap("More", in: safari, timeout: 2),
                    "Safari did not expose its page/extension menu",
                )
                XCTAssertTrue(tap("Extensions", in: safari, timeout: 5), "Safari Extensions menu was unavailable")
            }
            XCTAssertTrue(tap("Plainly", in: safari, timeout: 5), "Plainly was not available in Safari's Extensions menu")
        }

        // Query the accessibility tree without assuming whether Safari exposes the field
        // as a text field or secure text field on a particular iPadOS release.
        let field = find("OpenAI API key", in: safari)
        XCTAssertTrue(field.waitForExistence(timeout: 10), "Plainly popup did not expose the API-key field")
        field.tap()
        field.typeText(apiKey)
        XCTAssertTrue(tap("Save", in: safari, timeout: 5), "Plainly Save button was unavailable")
        XCTAssertTrue(
            find("API key saved on this device.", in: safari).waitForExistence(timeout: 10),
            "Plainly did not persist the API key",
        )

        safari.coordinate(withNormalizedOffset: CGVector(dx: 0.05, dy: 0.50)).tap()
    }

    private func allowWebsiteAccessIfPrompted() {
        for label in ["Always Allow on This Website", "Always Allow", "Allow for One Day", "Allow"] {
            if tap(label, in: safari, timeout: 2) {
                return
            }
        }
    }

    private func scrollAndTap(_ label: String, in app: XCUIApplication) -> Bool {
        for _ in 0..<8 {
            if tap(label, in: app, timeout: 0.5) {
                return true
            }
            app.swipeUp()
        }
        return false
    }

    private func tap(_ label: String, in app: XCUIApplication, timeout: TimeInterval) -> Bool {
        // Query .any first: querying a missing typed element inside Apple's Settings
        // hierarchy can itself abort an XCTest snapshot. Once a label exists, use its
        // frame directly; Settings rows with frame-less descendants fall back to a cell.
        let element = find(label, in: app)
        guard element.waitForExistence(timeout: timeout) else { return false }

        if hasFrame(element) {
            tapCenter(element)
            return true
        }

        let row = app.cells.containing(.staticText, identifier: label).firstMatch
        guard row.exists, hasFrame(row) else { return false }
        tapCenter(row)
        return true
    }

    private func find(_ label: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any)
            .matching(NSPredicate(format: "label == %@ OR identifier == %@", label, label))
            .firstMatch
    }

    private func hasFrame(_ element: XCUIElement) -> Bool {
        let frame = element.frame
        return !frame.isNull && !frame.isEmpty && frame.width > 0 && frame.height > 0
    }

    private func tapCenter(_ element: XCUIElement) {
        element.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
    }

    private func enable(_ toggle: XCUIElement) {
        guard isOff(toggle) else { return }

        // In iPad Settings the accessibility frame for this switch can span the complete
        // row. XCUIElement.tap() therefore lands on the inert row centre. Target the
        // trailing switch control explicitly and allow Settings time to publish its value.
        toggle.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.5)).tap()

        let deadline = Date().addingTimeInterval(5)
        while isOff(toggle), Date() < deadline {
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        }
        XCTAssertFalse(isOff(toggle), "Plainly remained disabled after toggling it")
    }

    private func isOff(_ toggle: XCUIElement) -> Bool {
        let value = String(describing: toggle.value ?? "")
        return value == "0" || value.caseInsensitiveCompare("off") == .orderedSame
    }

    private func keep(_ screenshot: XCUIScreenshot, name: String) {
        let attachment = XCTAttachment(screenshot: screenshot)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func keep(_ value: String, name: String) {
        let attachment = XCTAttachment(string: value)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
