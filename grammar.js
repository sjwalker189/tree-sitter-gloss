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

    // --- Functions ---
    function_definition: ($) =>
      seq(
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
      seq("enum", field("name", $.identifier), $.enum_body),

    enum_body: ($) => seq("{", sepBy(",", $.enum_member), optional(","), "}"),

    enum_member: ($) =>
      seq(
        field("name", $.property_identifier),
        optional(seq("=", $._expression)),
      ),

    union_definition: ($) =>
      seq(
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
        "struct",
        field("name", $.identifier),
        optional($.type_parameters),
        field("body", $.struct_body),
      ),

    struct_body: ($) =>
      seq("{", sepBy(",", $.struct_field), optional(","), "}"),

    struct_field: ($) =>
      seq(field("name", $.identifier), ":", field("type", $._type)),

    // --- Types ---
    _type: ($) =>
      choice(
        $.type_literal, // e.g., int, string
        $.type_identifier, // e.g., T
        alias($.struct_body, $.struct_type), // anonymous struct in union
      ),

    property_identifier: ($) => $.identifier,

    generic_type: ($) => seq(field("name", $.identifier), $.type_parameters),

    type_literal: ($) => choice("int", "string", "bool"),

    type_identifier: ($) => $.identifier,

    type_parameters: ($) =>
      field("type_parameters", seq("<", sepBy(",", $.type_parameter), ">")),

    type_parameter: ($) => field("name", $.identifier),

    // --- Statements ---
    block: ($) => seq("{", repeat($._statement), "}"),

    _statement: ($) =>
      choice(
        $.return_statement,
        $.let_statement,
        // Expand here for other statement types (if, while, etc.)
      ),

    return_statement: ($) => seq("return", optional($._expression)),

    // --- Expressions ---
    _expression: ($) =>
      choice(
        $.binary_expression,
        $.primary_expression,
        $.struct_expression,
        $.boolean,
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

    primary_expression: ($) =>
      choice($.parenthesized_expression, $.identifier, $.number, $.string),

    parenthesized_expression: ($) => seq("(", $._expression, ")"),

    struct_expression: ($) =>
      seq(
        field("name", choice($.identifier, $.generic_type)),
        field("body", $.field_initilizer_list),
      ),

    field_initilizer_list: ($) =>
      seq("{", sepBy(",", $.field_initializer), optional(","), "}"),

    field_initializer: ($) =>
      seq(field("name", $.identifier), ":", field("value", $._expression)),

    call_expression: ($) =>
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

    labeled_function_argument: ($) =>
      seq(field("label", $.identifier), ":", $._expression),

    labeled_function_argument_punned: ($) =>
      seq(":", field("label", $.identifier)),

    // --- Tokens ---
    identifier: ($) => /[a-zA-Z_][a-zA-Z0-9_]*/,

    number: ($) => /\d+/,

    string: ($) => /"([^"\\]|\\.)*"/,

    boolean: ($) => choice("true", "false"),

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
