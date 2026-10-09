// An external scanner for one token: the character data inside an element.
//
// It exists because `extras` cannot be turned off for a single rule. Everything between an
// element's `>` and the next `<` or `{` is content *including its whitespace* — the space in
// `<p>a b</p>` is part of the document, and the newline and indentation in
//
//     <div>
//       hello
//     </div>
//
// are too. A normal grammar rule cannot express that, because tree-sitter skips whitespace
// before attempting any token, so `hello` would arrive with its surroundings already eaten.
//
// The compiler solves the same problem with a lexer *mode*: inside an element the only tokens
// are a run of text, a `<`, and a `{}`, and nothing else applies — no comments, no string
// literals, no operators. That is the reason `<p>http://x</p>` does not lose its closing tag
// to a line comment, and it is the behaviour reproduced here.
//
// The scanner is stateless. Tree-sitter tells us whether `element_text` is valid in the
// current parse state, which is all the context this needs — the LR automaton has already
// decided we are inside an element.

#include "tree_sitter/parser.h"

enum TokenType {
  ELEMENT_TEXT,
  SOFT_END,
  SQL_KEYWORD,
};

static bool is_name_char(int32_t c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_';
}

static bool is_space(int32_t c) { return c == ' ' || c == '\t' || c == '\r' || c == '\n'; }

// `sql` opens a query literal only when a `(` or a `{` follows it, and is an ordinary name
// everywhere else — `sql::render(..)`, `let sql = ..` — which is what the compiler's
// `at_sql_literal` decides by peeking at the next token. An internal keyword cannot peek: where
// a literal may start, every `sql` would lex as the keyword and `sql::render` would be an error.
static bool scan_sql_keyword(TSLexer *lexer) {
  while (is_space(lexer->lookahead)) {
    lexer->advance(lexer, true);
  }
  if (lexer->lookahead != 's') return false;
  lexer->advance(lexer, false);
  if (lexer->lookahead != 'q') return false;
  lexer->advance(lexer, false);
  if (lexer->lookahead != 'l') return false;
  lexer->advance(lexer, false);
  if (is_name_char(lexer->lookahead)) return false;
  lexer->mark_end(lexer);
  while (is_space(lexer->lookahead)) {
    lexer->advance(lexer, true);
  }
  if (lexer->lookahead != '(' && lexer->lookahead != '{') return false;
  lexer->result_symbol = SQL_KEYWORD;
  return true;
}

void *tree_sitter_gloss_external_scanner_create(void) { return NULL; }
void tree_sitter_gloss_external_scanner_destroy(void *payload) { (void)payload; }
void tree_sitter_gloss_external_scanner_reset(void *payload) { (void)payload; }

unsigned tree_sitter_gloss_external_scanner_serialize(void *payload, char *buffer) {
  (void)payload;
  (void)buffer;
  return 0;
}

void tree_sitter_gloss_external_scanner_deserialize(void *payload, const char *buffer,
                                                    unsigned length) {
  (void)payload;
  (void)buffer;
  (void)length;
}

bool tree_sitter_gloss_external_scanner_scan(void *payload, TSLexer *lexer,
                                             const bool *valid_symbols) {
  (void)payload;

  // A statement ends at a line break when the next line opens with `<`, `(` or `-`: an
  // element, a parenthesized value or a negation, which the compiler's parser reads the same
  // way (`newline_before` in `parser.rs`). Only the whitespace is consumed; the token that
  // follows is lexed as the start of the next statement. Every other line break is left to the
  // automaton, which ends the statement by running out of ways to continue it. Asked first,
  // because `element_text` is never valid in the same state.
  if (valid_symbols[SOFT_END]) {
    bool newline = false;
    while (lexer->lookahead == ' ' || lexer->lookahead == '\t' || lexer->lookahead == '\r' ||
           lexer->lookahead == '\n') {
      if (lexer->lookahead == '\n') {
        newline = true;
      }
      lexer->advance(lexer, true);
    }
    if (newline && (lexer->lookahead == '<' || lexer->lookahead == '(' ||
                    lexer->lookahead == '[' || lexer->lookahead == '-')) {
      lexer->result_symbol = SOFT_END;
      lexer->mark_end(lexer);
      return true;
    }
    // Not a soft end; the whitespace was skipped, so a query literal may still start here.
    return valid_symbols[SQL_KEYWORD] && scan_sql_keyword(lexer);
  }

  if (valid_symbols[SQL_KEYWORD] && scan_sql_keyword(lexer)) {
    return true;
  }

  if (!valid_symbols[ELEMENT_TEXT]) {
    return false;
  }

  // Run to the next `<` or `{`, or to the end of the file. `}` is deliberately *not* a
  // terminator: a closing brace with no opening one is ordinary text, and treating it as a
  // delimiter would split `<p>a } b</p>` into three children for no reason.
  bool consumed_any = false;
  while (lexer->lookahead != 0 && lexer->lookahead != '<' && lexer->lookahead != '{') {
    lexer->advance(lexer, false);
    consumed_any = true;
  }

  if (!consumed_any) {
    return false;
  }

  lexer->result_symbol = ELEMENT_TEXT;
  lexer->mark_end(lexer);
  return true;
}
