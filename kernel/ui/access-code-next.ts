// The query parameter an access-code gate carries to say where to go after a
// successful unlock. Its own module, not the form's, because the form is a
// "use client" file and the server routes that build the redirect import this
// too: a constant read from a client module on the server is a reference, not
// the value.
export const ACCESS_CODE_NEXT_PARAM = "next";
