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

        let adjustedIndicator = safari.descendants(matching: .button)
            .matching(NSPredicate(format: "label CONTAINS 'Plainly' AND label CONTAINS 'Oxford 8'"))
            .firstMatch
        XCTAssertTrue(
            adjustedIndicator.waitForExistence(timeout: 75),
            "Plainly never exposed its adjusted-state indicator in normal iPad Safari",
        )

        adjustedIndicator.tap()
        XCTAssertTrue(
            find("Plainly · Original", in: safari).waitForExistence(timeout: 5),
            "Plainly indicator could not restore the source text",
        )
        XCTAssertTrue(tap("Plainly · Original", in: safari, timeout: 5))
        XCTAssertTrue(adjustedIndicator.waitForExistence(timeout: 5))

        keep(XCUIScreen.main.screenshot(), name: "plainly-adjusted-wikipedia")
    }

    private func enablePlainlyInSafariSettings() {
        settings.terminate()
        settings.launch()

        if tap("Apps", in: settings, timeout: 5) {
            XCTAssertTrue(scrollAndTap("Safari", in: settings), "Safari settings were not reachable from Settings > Apps")
        } else {
            let search = settings.searchFields.firstMatch
            XCTAssertTrue(search.waitForExistence(timeout: 5), "Settings search field was unavailable")
            search.tap()
            search.typeText("Safari")
            XCTAssertTrue(tap("Safari", in: settings, timeout: 5), "Safari settings were not found")
        }

        XCTAssertTrue(scrollAndTap("Extensions", in: settings), "Safari Extensions settings were not found")
        XCTAssertTrue(scrollAndTap("Plainly", in: settings), "Installed Plainly extension was not listed by Safari")

        let namedSwitch = settings.switches
            .matching(NSPredicate(format: "label CONTAINS[c] 'Allow Extension' OR label CONTAINS[c] 'Plainly'"))
            .firstMatch
        let extensionSwitch = namedSwitch.exists ? namedSwitch : settings.switches.firstMatch
        XCTAssertTrue(extensionSwitch.waitForExistence(timeout: 5), "Plainly enable switch was not available")
        if isOff(extensionSwitch) {
            extensionSwitch.tap()
        }
        XCTAssertFalse(isOff(extensionSwitch), "Plainly remained disabled after toggling it")

        grantWebsiteAccessIfPresent()
    }

    private func grantWebsiteAccessIfPresent() {
        for site in ["All Websites", "en.wikipedia.org", "Wikipedia"] {
            guard tap(site, in: settings, timeout: 1) else { continue }
            if tap("Allow", in: settings, timeout: 2) || tap("Always Allow", in: settings, timeout: 2) {
                return
            }
        }
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

        let keyField = safari.secureTextFields["OpenAI API key"].firstMatch
        let fallbackField = safari.textFields["OpenAI API key"].firstMatch
        let field = keyField.exists ? keyField : fallbackField
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
        let exact = NSPredicate(format: "label == %@ OR identifier == %@", label, label)
        let containingRow = NSPredicate(format: "label CONTAINS[c] %@ OR identifier == %@", label, label)
        let candidates = [
            app.buttons.matching(exact).firstMatch,
            app.cells.matching(exact).firstMatch,
            app.cells.matching(containingRow).firstMatch,
            app.links.matching(exact).firstMatch,
            app.staticTexts.matching(exact).firstMatch,
        ]
        let deadline = Date().addingTimeInterval(timeout)

        repeat {
            for element in candidates where element.exists {
                let frame = element.frame
                guard !frame.isNull, !frame.isEmpty, frame.width > 0, frame.height > 0 else { continue }
                element.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
                return true
            }
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        } while Date() < deadline

        return false
    }

    private func find(_ label: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any)
            .matching(NSPredicate(format: "label == %@ OR identifier == %@", label, label))
            .firstMatch
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
