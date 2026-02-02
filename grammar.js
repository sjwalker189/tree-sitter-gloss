/**
 * @file Gloss grammar for tree-sitter
 * @author Sam Walker <sjwalker189@gmail.com>
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

module.exports = grammar({
  name: "gloss",

  extras: ($) => [/\s/, $.comment],

  word: ($) => $.identifier,

  rules: {
    source_file: ($) => repeat($._declaration),

    _declaration: ($) =>
      choice(
        $.function_definition,
        $.let_statement,
        $.enum_definition,
        $.union_definition,
        $.struct_definition,
      ),

    visibility: ($) => "pub",

    // --- Functions ---
    function_definition: ($) =>
      seq(
        optional($.visibility),
        "fn",
        field("name", $.identifier),
        optional($.type_parameters),
        field("parameters", $.parameter_list),
        optional(field("return_type", $._type)),
        field("body", $.block),
      ),

    parameter_list: ($) => seq("(", sepBy(",", $.parameter), ")"),

    parameter: ($) => seq(field("name", $.identifier), field("type", $._type)),

    // --- Let Statements ---
    let_statement: ($) =>
      seq(
        "let",
        field("name", $.identifier),
        "=",
        field("value", $._expression),
      ),

    // --- Type Definitions ---
    enum_definition: ($) =>
      seq(
        optional($.visibility),
        "enum",
        field("name", $.identifier),
        $.enum_body,
      ),

    enum_body: ($) => seq("{", sepBy(",", $.enum_member), optional(","), "}"),

    enum_member: ($) =>
      seq(
        field("name", $.property_identifier),
        optional(seq("=", $._expression)),
      ),

    union_definition: ($) =>
      seq(
        optional($.visibility),
        "union",
        field("name", $.identifier),
        optional($.type_parameters),
        $.union_body,
      ),

    union_body: ($) => seq("{", sepBy(",", $.union_field), optional(","), "}"),

    union_field: ($) =>
      seq(
        field("name", $.identifier),
        optional(seq("(", field("type", $._type), ")")),
      ),

    struct_definition: ($) =>
      seq(
        optional($.visibility),
        "struct",
        field("name", $.identifier),
        optional($.type_parameters),
        field("body", $.struct_body),
      ),

    struct_body: ($) =>
      seq("{", sepBy(",", $.struct_field), optional(","), "}"),

    struct_field: ($) =>
      seq(field("name", $.identifier), ":", field("type", $._type)),

    composite_literal: ($) =>
      seq(field("type", $._type), field("body", $.literal_value)),

    literal_value: ($) =>
      seq("{", optional(seq(sepBy(",", $._expression), optional(","))), "}"),

    // --- Types ---
    _type: ($) =>
      choice(
        $.type_literal, // e.g., int, string
        $.type_identifier, // e.g., T
        $.generic_type, // e.g. Option<int>
        $.slice_type,
        alias($.struct_body, $.struct_type), // anonymous struct
      ),

    property_identifier: ($) => $.identifier,

    generic_type: ($) => seq(field("name", $.identifier), $.type_parameters),

    slice_type: ($) => seq("[", "]", field("element_type", $._type)),

    type_literal: ($) => choice("int", "string", "bool"),

    type_identifier: ($) => $.identifier,

    type_parameters: ($) =>
      field("type_parameters", seq("<", sepBy(",", $.type_parameter), ">")),

    type_parameter: ($) => field("name", $.identifier),

    // --- Statements ---

    _statement: ($) =>
      choice(
        $.return_statement,
        $.let_statement,
        $.if_statement,
        $.block,
        $._expression,
      ),

    block: ($) => prec(1, seq("{", repeat($._statement), "}")),

    return_statement: ($) => prec.right(seq("return", optional($._expression))),

    if_statement: ($) =>
      prec.right(
        seq(
          "if",
          field("condition", $._expression),
          field("consequence", $.block),
          optional(
            seq("else", field("alternative", choice($.block, $.if_statement))),
          ),
        ),
      ),

    // --- Expressions ---
    _expression: ($) =>
      choice(
        $.boolean,
        $.composite_literal,
        $.unary_expression,
        $.binary_expression,
        $.primary_expression,
        $.struct_expression,
        $.call_expression,
      ),

    binary_expression: ($) =>
      choice(
        ...[
          ["*", 4],
          ["/", 4],
          ["+", 3],
          ["-", 3],
        ].map(([operator, precedence]) =>
          prec.left(
            precedence,
            seq(
              field("left", $._expression),
              field("operator", operator),
              field("right", $._expression),
            ),
          ),
        ),
      ),

    unary_expression: ($) =>
      prec(
        6,
        seq(
          field("operator", choice("-", "+")),
          field("argument", $._expression),
        ),
      ),

    primary_expression: ($) =>
      choice($.parenthesized_expression, $.identifier, $._number, $.string),

    parenthesized_expression: ($) => seq("(", $._expression, ")"),

    struct_expression: ($) =>
      prec(
        1,
        seq(
          field("name", choice($.identifier, $.generic_type)),
          field("body", $.field_initilizer_list),
        ),
      ),

    field_initilizer_list: ($) =>
      seq("{", sepBy(",", $.field_initializer), optional(","), "}"),

    field_initializer: ($) =>
      seq(field("name", $.identifier), ":", field("value", $._expression)),

    call_expression: ($) =>
      prec(
        1,
        seq(
          field("name", $.identifier),
          "(",

          // fn sum(1, 2)
          // fn sum(a: 1, b: 2)
          // fn sum(:a, :b)
          optional(
            sepBy(
              ",",
              choice(
                $._expression,
                $.labeled_function_argument,
                $.labeled_function_argument_punned,
              ),
            ),
          ),
          optional(","),
          ")",
        ),
      ),

    labeled_function_argument: ($) =>
      seq(field("label", $.identifier), ":", $._expression),

    labeled_function_argument_punned: ($) =>
      field("label", $.labeled_identifier),

    labeled_identifier: ($) => seq(":", $.identifier),

    // --- Tokens ---
    identifier: ($) => /[a-zA-Z_][a-zA-Z0-9_]*/,

    // --- Numbers ---
    _number: ($) => choice($.float_literal, $.int_literal),

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

    string: ($) => /"([^"\\]|\\.)*"/,

    boolean: ($) => choice("true", "false"),

    nil: ($) => "nil",

    comment: ($) =>
      token(
        choice(seq("//", /.*/), seq("/*", /[^*]*\*+([^/*][^*]*\*+)*/, "/")),
      ),
  },
});

// Helper for comma-separated lists
function sepBy(sep, rule) {
  return optional(seq(rule, repeat(seq(sep, rule))));
}
