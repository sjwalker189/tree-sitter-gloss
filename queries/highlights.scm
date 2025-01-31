; Comments

(comment) @comment
(developer_comment) @comment

; Identifiers
((identifier) @constant
 (#match? @constant "^[A-Z][A-Z\\d_]+$'"))

(field_identifier) @property
(type_identifier) @type


; Package System

(visibility_modifier) @keyword

; Enums

"enum" @keyword

; TODO: This should be defined in tags.scm?
(enum_item
 name: (identifier) @type
) 

(enum_member
  name: (field_identifier) @constant) 


; Models

"model" @keyword

(model_item
  name: (identifier) @type
)

(model_field
  name: (field_identifier) @property
)


; Views

"view" @keyword

(view_item
  name: (identifier) @type
)

(view_parameters
  props: (identifier) @variable.parameter

)

; Punctuation

":" @punctuation.delimiter
"," @punctuation.delimiter
"{" @punctuation.delimiter
"}" @punctuation.delimiter
"(" @punctuation.delimiter
")" @punctuation.delimiter


; Builtin types

(string) @string
(number) @number

