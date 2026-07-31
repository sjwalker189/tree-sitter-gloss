#include "tree_sitter/parser.h"

// Stateless external scanner implementing Go-style automatic statement
// termination. It emits a single zero-width token (`_automatic_semicolon`) at
// statement boundaries so that block trailing expressions — notably JSX, whose
// leading `<` would otherwise lex as a relational operator — parse correctly.
//
// The token is only ever requested where the grammar permits it (the parser
// sets `valid_symbols[AUTOMATIC_SEMICOLON]` only at statement boundaries), so
// newlines inside expressions / JSX child lists never terminate.

enum TokenType {
    AUTOMATIC_SEMICOLON,
};

void *tree_sitter_gloss_external_scanner_create(void) { return NULL; }

void tree_sitter_gloss_external_scanner_destroy(void *payload) { (void)payload; }

unsigned tree_sitter_gloss_external_scanner_serialize(void *payload, char *buffer) {
    (void)payload;
    (void)buffer;
    return 0; // stateless
}

void tree_sitter_gloss_external_scanner_deserialize(void *payload, const char *buffer,
                                                    unsigned length) {
    (void)payload;
    (void)buffer;
    (void)length;
}

static inline void skip(TSLexer *lexer) { lexer->advance(lexer, true); }

static bool scan_automatic_semicolon(TSLexer *lexer) {
    // Zero-width: fix the token end at the current position before consuming any
    // whitespace, so the newline/`}` is re-lexed normally afterward.
    lexer->result_symbol = AUTOMATIC_SEMICOLON;
    lexer->mark_end(lexer);

    for (;;) {
        if (lexer->eof(lexer)) {
            return true;
        }

        // A newline (or a `}` closing the block) ends the statement.
        if (lexer->lookahead == '\n' || lexer->lookahead == '}') {
            return true;
        }

        // Horizontal whitespace: keep scanning forward.
        if (lexer->lookahead == ' ' || lexer->lookahead == '\t' ||
            lexer->lookahead == '\r' || lexer->lookahead == '\f' ||
            lexer->lookahead == '\v') {
            skip(lexer);
            continue;
        }

        // Line comment `// ...`: skip to its end; the trailing newline (or EOF)
        // handled above then terminates the statement.
        if (lexer->lookahead == '/') {
            skip(lexer);
            if (lexer->lookahead == '/') {
                while (!lexer->eof(lexer) && lexer->lookahead != '\n') {
                    skip(lexer);
                }
                continue;
            }
            // A lone `/` is real token content (division), not a boundary.
            return false;
        }

        // Any other character means the statement continues on this line.
        return false;
    }
}

bool tree_sitter_gloss_external_scanner_scan(void *payload, TSLexer *lexer,
                                             const bool *valid_symbols) {
    (void)payload;
    if (valid_symbols[AUTOMATIC_SEMICOLON]) {
        return scan_automatic_semicolon(lexer);
    }
    return false;
}
