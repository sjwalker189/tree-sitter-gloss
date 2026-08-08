; Language injection.
;
; Deliberately almost empty. The obvious candidate — treating an element's character data as
; HTML — would be wrong: `<div>` here is *not* HTML. It is syntax over whatever vocabulary the
; program declared, and the same source emits HTML, email or PDF depending on the medium it is
; given. Injecting one of those would highlight a lie.
;
; Element content is plain text and is marked as such by `highlights.scm`.

((comment) @injection.content
  (#set! injection.language "comment"))
