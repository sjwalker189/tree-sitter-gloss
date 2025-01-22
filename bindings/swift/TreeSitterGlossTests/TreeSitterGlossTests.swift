import XCTest
import SwiftTreeSitter
import TreeSitterGloss

final class TreeSitterGlossTests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_gloss())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading Gloss grammar")
    }
}
