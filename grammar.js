/**
 * @file Gloss grammar for tree-sitter
 * @author Sam Walker <sjwalker189@gmail.com>
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

// Helper functions (standard practice in Go and Rust tree-sitter grammars)
function commaSep(rule) {
  return optional(commaSep1(rule));
}

function commaSep1(rule) {
  return seq(rule, repeat(seq(",", rule)));
}

const PREC = {
  assign: 1,
  logical_or: 2, // ||
  logical_and: 3, // &&
  bitwise_or: 4, // |
  bitwise_xor: 5, // ^
  bitwise_and: 6, // &
  equality: 7, // ==, !=  (Usually lower than <, >)
  relational: 8, // <, <=, >, >=
  shift: 9, // <<, >>
  add: 10, // +, -
  mult: 11, // *, /, %
  unary: 12, // !, -, +, ~
  call: 13,
  member: 14,
  postfix: 15,
  index: 16,
};

module.exports = grammar({
  name: "gloss",

  // Ignore whitespace and comments automatically
  extras: ($) => [/\s/, $.comment],

  conflicts: ($) => [
    [$._statement, $.expression],
    [$.expression, $.composite_literal],
    [$.expression, $._jsx_element_name],
  ],

  reserved: {
    global: ($) => [
      "break",
      "fn",
      "struct",
      "else",
      "const",
      "if",
      "continue",
      "for",
      "while",
      "loop",
      "return",
      "let",
    ],
  },

  rules: {
    // ------------------------------------------------------------------------
    // Top-Level
    // ------------------------------------------------------------------------
    source_file: ($) => repeat($._declaration),

    comment: ($) => token(seq("//", /.*/)),

    _declaration: ($) =>
      choice(
        $.enum_declaration,
        $.union_declaration,
        $.struct_declaration,
        $.function_declaration,
        $.constant_declaration,
        $.variable_declaration,
      ),

    // ------------------------------------------------------------------------
    // Declarations
    // ------------------------------------------------------------------------

    // Enums
    enum_declaration: ($) =>
      seq("enum", field("name", $.type_identifier), field("body", $.enum_body)),
    enum_body: ($) => seq("{", commaSep($.enum_variant), optional(","), "}"),
    enum_variant: ($) =>
      seq(
        field("name", $.identifier),
        optional(seq("=", field("value", $.expression))),
      ),

    // Unions
    union_declaration: ($) =>
      seq(
        "union",
        field("name", $.type_identifier),
        optional(field("type_parameters", $.type_parameters)),
        field("body", $.union_body),
      ),
    union_body: ($) => seq("{", commaSep($.union_variant), optional(","), "}"),
    union_variant: ($) =>
      seq(
        field("name", $.identifier),
        optional(field("payload", $.union_payload)),
      ),
    union_payload: ($) =>
      seq(
        "(",
        choice(
          field("type", $._type),
          field("inline_struct", $.inline_struct_type),
        ),
        ")",
      ),
    inline_struct_type: ($) =>
      seq("{", commaSep($.field_declaration), optional(","), "}"),

    slice_type: ($) => seq("[", "]", field("element", $._type)),

    // Structs
    struct_declaration: ($) =>
      seq(
        "struct",
        field("name", $.type_identifier),
        optional(field("type_parameters", $.type_parameters)),
        field("body", $.struct_body),
      ),
    struct_body: ($) =>
      seq("{", commaSep($.field_declaration), optional(","), "}"),
    field_declaration: ($) =>
      seq(
        field("name", $.identifier),
        ":", // Assuming colon is required in structs based on your snippet
        field("type", $._type),
      ),

    // Functions
    function_declaration: ($) =>
      seq(
        optional(field("visibility", $.visibility_modifier)),
        "fn",
        field("name", $.identifier),
        optional(field("type_parameters", $.type_parameters)),
        field("parameters", $.parameter_list),
        optional(field("return_type", $._type)),
        field("body", $.block),
      ),
    visibility_modifier: ($) => "pub",
    parameter_list: ($) => seq("(", commaSep($.parameter_declaration), ")"),
    parameter_declaration: ($) =>
      seq(
        field("name", $.identifier),
        optional(seq(":", field("type", $._type))),
      ),

    // Variables
    variable_declaration: ($) =>
      seq(
        "let",
        field("name", $.identifier),
        optional(seq(":", $._type)),
        "=",
        field("value", $.expression),
      ),

    constant_declaration: ($) =>
      seq(
        "const",
        field("name", $.identifier),
        "=",
        field("value", $.expression),
      ),

    // ------------------------------------------------------------------------
    // Types
    // ------------------------------------------------------------------------
    _type: ($) =>
      choice(
        $.identifier,
        $.type_identifier,
        $.generic_type,
        $.primitive_type,
        $.slice_type,
      ),

    // Distinguish type identifiers (capitalized conventionally) from regular ones
    primitive_type: ($) => choice("int", "string", "bool", "void", "nil"),

    generic_type: ($) =>
      seq(
        field("name", choice($.identifier, $.type_identifier)),
        field("type_arguments", $.type_arguments),
      ),
    type_parameters: ($) => seq("<", commaSep1($.type_identifier), ">"),
    type_arguments: ($) => seq("<", commaSep1($._type), ">"),

    // ------------------------------------------------------------------------
    // Statements & Blocks
    // ------------------------------------------------------------------------
    block: ($) => seq("{", repeat($._statement), optional($.expression), "}"),

    _statement: ($) =>
      choice(
        $.constant_declaration,
        $.variable_declaration,
        $.assignment_statement,
        $.call_expression,
        $.return_statement,
        $.if_statement,
        $.loop_statement,
        $.while_statement,
        $.for_statement,
        $.for_in_statement,
        $.break_statement,
        $.continue_statement,
      ),

    return_statement: ($) => prec.right(seq("return", optional($.expression))),

    assignment_statement: ($) =>
      seq(
        field(
          "left",
          choice($.identifier, $.member_expression, $.index_expression),
        ),
        field(
          "operator",
          choice(
            "=",
            "+=",
            "-=",
            "*=",
            "/=",
            "%=",
            "<<=",
            ">>=",
            "&=",
            "|=",
            "^=",
          ),
        ),
        field("right", $.expression),
      ),

    if_statement: ($) =>
      seq(
        "if",
        field("condition", $.expression),
        field("consequence", $.block),
        optional(
          seq("else", field("alternative", choice($.block, $.if_statement))),
        ),
      ),

    loop_statement: ($) => seq("loop", $.block),

    while_statement: ($) =>
      seq("while", field("condition", $.expression), field("body", $.block)),

    for_statement: ($) =>
      seq(
        "for",
        optional(
          field("initializer", choice($.variable_declaration, $.expression)),
        ),
        ";",
        optional(field("condition", $.expression)),
        ";",
        optional(field("update", $.expression)),
        field("body", $.block),
      ),

    for_in_statement: ($) =>
      seq(
        "for",
        field("index", $.identifier),
        ",",
        field("value", $.identifier),
        "in",
        field("right", $.expression),
        field("body", $.block),
      ),

    break_statement: ($) => "break",
    continue_statement: ($) => "continue",

    // ------------------------------------------------------------------------
    // Expressions
    // ------------------------------------------------------------------------
    expression: ($) =>
      choice(
        $.string,
        $.number,
        $.boolean,
        $.unary_expression,
        $.binary_expression,
        $.update_expression,
        $.parenthesized_expression,
        $.composite_literal,
        $.call_expression,
        $.member_expression,
        $.index_expression,
        $.match_expression,
        $.anonymous_function,
        $.jsx_element, // <div>...</div>
        $.jsx_self_closing_element, // <br />
        $.jsx_fragment, // <>...</>
        $.type_identifier,
        $.identifier,
      ),

    // prec(1) eagerly binds the `{` to the type identifier so it doesn't
    // prematurely end `let` declarations.
    composite_literal: ($) =>
      seq(
        field("type", choice($.identifier, $.type_identifier, $.slice_type)),
        field("body", $.literal_body),
      ),

    literal_body: ($) =>
      seq(
        "{",
        optional(
          choice(
            commaSep1($.field_value), // For structs: { field: value, }
            commaSep1($.expression), // For slices: { 1, 2, 3 }
          ),
        ),
        optional(","),
        "}",
      ),

    field_value: ($) =>
      seq(field("name", $.identifier), ":", field("value", $.expression)),

    unary_expression: ($) =>
      prec(
        PREC.unary,
        seq(
          field("operator", choice("-", "+", "!", "~")),
          field("argument", $.expression),
        ),
      ),

    binary_expression: ($) =>
      choice(
        ...[
          ["*", PREC.mult],
          ["/", PREC.mult],
          ["%", PREC.mult],
          ["+", PREC.add],
          ["-", PREC.add],
          ["<<", PREC.shift],
          [">>", PREC.shift],
          ["<", PREC.relational],
          ["<=", PREC.relational],
          [">", PREC.relational],
          [">=", PREC.relational],
          ["==", PREC.equality],
          ["!=", PREC.equality],
          ["&", PREC.bitwise_and],
          ["^", PREC.bitwise_xor],
          ["|", PREC.bitwise_or],
          ["&&", PREC.logical_and],
          ["||", PREC.logical_or],
        ].map(([operator, precedence]) =>
          prec.left(
            precedence,
            seq(
              field("left", $.expression),
              field("operator", operator),
              field("right", $.expression),
            ),
          ),
        ),
      ),

    update_expression: ($) =>
      choice(
        prec.left(
          PREC.postfix,
          seq(
            field("argument", $.expression),
            field("operator", choice("++", "--")),
          ),
        ),
        prec.right(
          PREC.unary,
          seq(
            field("operator", choice("++", "--")),
            field("argument", $.expression),
          ),
        ),
      ),

    member_expression: ($) =>
      prec.left(
        PREC.member,
        seq(
          field("object", $.expression),
          ".",
          field("property", $.property_identifier),
        ),
      ),

    parenthesized_expression: ($) => seq("(", $.expression, ")"),

    call_expression: ($) =>
      prec.left(
        PREC.call,
        seq(
          field("function", $.expression),
          field("arguments", $.argument_list),
        ),
      ),

    index_expression: ($) =>
      prec.left(
        PREC.index,
        seq(
          field("operand", $.expression),
          "[",
          field("index", $.expression),
          "]",
        ),
      ),

    match_expression: ($) =>
      seq("match", field("value", $.expression), field("body", $.match_body)),

    match_body: ($) =>
      seq(
        "{",
        optional(
          seq(
            $.match_arm,
            repeat(seq(optional(","), $.match_arm)),
            optional(","),
          ),
        ),
        "}",
      ),

    match_arm: ($) =>
      seq(
        field("pattern", $._pattern),
        "=>",
        field("value", choice($.expression, $.block)),
      ),

    // --- PATTERNS ---
    _pattern: ($) =>
      choice(
        alias("_", $.catch_all_pattern),
        $.number,
        $.string,
        $.boolean,
        $.identifier,
        $.enum_pattern,
      ),

    enum_pattern: ($) =>
      seq(
        field("name", $.type_identifier),
        optional(seq("(", commaSep($._pattern), ")")),
      ),

    anonymous_function: ($) =>
      seq(
        "fn",
        optional(field("type_parameters", $.type_parameters)),
        field("parameters", $.parameter_list),
        optional(field("return_type", $._type)),
        field("body", choice($.block, seq("=>", $.expression))),
      ),

    argument_list: ($) =>
      seq("(", optional(seq(commaSep($._argument), optional(","))), ")"),

    _argument: ($) =>
      choice($.expression, $.labeled_argument, $.punned_argument),

    // Standard labeled argument: a: 5
    labeled_argument: ($) =>
      seq(field("label", $.identifier), ":", field("value", $.expression)),

    // Punned argument: :a
    punned_argument: ($) => seq(":", field("label", $.identifier)),

    // Elements
    jsx_element: ($) =>
      seq($.jsx_opening_element, repeat($._jsx_child), $.jsx_closing_element),

    // 2. Fragments: <> Hello </>
    jsx_fragment: ($) => seq("<", ">", repeat($._jsx_child), "<", "/", ">"),

    // 3. Self-closing: <input type="text" />
    jsx_self_closing_element: ($) =>
      seq(
        "<",
        field("name", $._jsx_element_name),
        repeat(field("attribute", $.jsx_attribute)),
        "/",
        ">",
      ),

    jsx_opening_element: ($) =>
      seq(
        "<",
        field("name", $._jsx_element_name),
        repeat(field("attribute", $.jsx_attribute)),
        ">",
      ),

    jsx_closing_element: ($) =>
      seq("<", "/", field("name", $._jsx_element_name), ">"),

    // JSX element names can be lowercase (div), uppercase (Button), or members (UI.Button)
    _jsx_element_name: ($) =>
      choice($.identifier, $.type_identifier, $.member_expression),

    // Attributes: id="main" OR onClick={handleClick}
    jsx_attribute: ($) =>
      seq(
        field("name", $.identifier),
        optional(seq("=", field("value", choice($.string, $.jsx_expression)))),
      ),

    // Inside a JSX tag, you can have text, nested JSX, or a Gloss expression
    _jsx_child: ($) =>
      choice(
        $.jsx_text,
        $.jsx_element,
        $.jsx_self_closing_element,
        $.jsx_fragment,
        $.jsx_expression,
      ),

    // { user.name }
    jsx_expression: ($) =>
      seq("{", repeat($._statement), optional($.expression), "}"),

    // Plain text: Matches anything that isn't a `<` or `{`
    jsx_text: ($) => /[^{<]+/,

    // ------------------------------------------------------------------------
    // Primitives / Terminals
    // ------------------------------------------------------------------------
    identifier: ($) => /[a-zA-Z_][a-zA-Z0-9_]*/,
    blank_identifier: ($) => "_",
    property_identifier: ($) => /[a-zA-Z_][a-zA-Z0-9_]*/,
    type_identifier: ($) => /[A-Z][a-zA-Z0-9_]*/,

    string: ($) =>
      seq(
        '"',
        repeat(
          choice(
            // Normal text (anything that isn't a quote, backslash, or newline)
            token.immediate(prec(1, /[^\\"\n]+/)),

            // The escape sequence
            $.escape_sequence,
          ),
        ),
        '"',
      ),

    escape_sequence: ($) =>
      token.immediate(
        seq(
          "\\",
          choice(
            /[^xuU]/, // Standard escapes like \n, \t, \r, \\, \"
            /u[0-9a-fA-F]{4}/, // Unicode escapes like \u00A9
            /U[0-9a-fA-F]{8}/, // Long Unicode escapes
            /x[0-9a-fA-F]{2}/, // Hex escapes like \x1F
          ),
        ),
      ),
    boolean: ($) => choice("true", "false"),
    nil: ($) => "nil",

    // Numbers

    number: ($) => choice($.float_literal, $.int_literal),

    // Priority 2: Floats (Must be higher than Int to catch '1.0' before '1')
    float_literal: ($) =>
      token(
        choice(
          // 1. Decimal floats with a dot (e.g., 1.0, 1., 1.23, 1.2e-5)
          //    Matches: Digits + Dot + Optional Digits + Optional Exponent
          /\d+(_?\d+)*\.(\d+(_?\d+)*)?([eE][+-]?\d+(_?\d+)*)?/,

          // 2. Decimal floats starting with a dot (e.g., .5, .2e+5)
          /\.\d+(_?\d+)*([eE][+-]?\d+(_?\d+)*)?/,

          // 3. Scientific notation without a dot (e.g., 1e5)
          /\d+(_?\d+)*[eE][+-]?\d+(_?\d+)*/,

          // 4. Hexadecimal floats (e.g., 0x1.fp-5)
          /0[xX][0-9a-fA-F]+(_?[0-9a-fA-F])*\.?[0-9a-fA-F]*(_?[0-9a-fA-F])*[pP][+-]?\d+(_?\d+)*/,
        ),
      ),

    // Priority 1: Integers
    int_literal: ($) =>
      token(
        choice(
          prec(2, /0[xX](_?[0-9a-fA-F])+/),
          prec(2, /0[bB](_?[01])+/),
          prec(2, /0[oO](_?[0-7])+/),
          prec(1, /[0-9](_?\d+)*/),
        ),
      ),
  },
});
