import XCTest

@MainActor
final class PlainlySafariAcceptanceTests: XCTestCase {
    private let settings = XCUIApplication(bundleIdentifier: "com.apple.Preferences")
    private let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
    private let wikipedia = URL(string: "https://en.wikipedia.org/wiki/Photosynthesis")!

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    override func tearDown() {
        if testRun?.hasSucceeded == false {
            keep(XCUIScreen.main.screenshot(), name: "failure")
            keep(settings.debugDescription, name: "settings-accessibility")
            keep(safari.debugDescription, name: "safari-accessibility")
        }
        super.tearDown()
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
        find("Plainly · Original", in: safari).tap()
        XCTAssertTrue(adjustedIndicator.waitForExistence(timeout: 5))

        keep(XCUIScreen.main.screenshot(), name: "plainly-adjusted-wikipedia")
    }

    private func enablePlainlyInSafariSettings() {
        settings.launch()
        unwindSettingsNavigation()

        if tap("Apps", in: settings, timeout: 3) {
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
            let row = find(site, in: settings)
            guard row.exists || row.waitForExistence(timeout: 1) else { continue }
            row.tap()
            if tap("Allow", in: settings, timeout: 2) || tap("Always Allow", in: settings, timeout: 2) {
                _ = tapBack(in: settings)
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
        let preferred = [
            "Always Allow on This Website",
            "Always Allow",
            "Allow for One Day",
            "Allow",
        ]
        for label in preferred {
            let element = find(label, in: safari)
            if element.waitForExistence(timeout: 2) {
                element.tap()
                return
            }
        }
    }

    private func unwindSettingsNavigation() {
        for _ in 0..<8 where tapBack(in: settings) {}
    }

    private func tapBack(in app: XCUIApplication) -> Bool {
        let button = app.navigationBars.buttons.firstMatch
        guard button.exists, button.isHittable else { return false }
        button.tap()
        return true
    }

    private func scrollAndTap(_ label: String, in app: XCUIApplication) -> Bool {
        for _ in 0..<8 {
            let element = find(label, in: app)
            if element.exists, element.isHittable {
                element.tap()
                return true
            }
            app.swipeUp()
        }
        return tap(label, in: app, timeout: 1)
    }

    private func tap(_ label: String, in app: XCUIApplication, timeout: TimeInterval) -> Bool {
        let element = find(label, in: app)
        guard element.waitForExistence(timeout: timeout) else { return false }
        element.tap()
        return true
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
