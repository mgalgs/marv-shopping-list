# Shopping list

A page for taking a shopping list from Marv, a kitchen robot, to the
shop. Marv shows a QR code; a phone's camera opens this page; the page
shows the list, grouped by the parts of the shop, to tick off as you go.

## Where the list is

The whole list is inside the link, in the part after the `#`. Browsers
never send that part to a server, so the server that hosts this page
never sees the list, and neither does anyone else. The page is one file,
`index.html`, and asks for nothing from anywhere: no fonts, pictures,
scripts or analytics. Its own Content-Security-Policy forbids it to.

Ticks are kept on the phone (in its local storage, under one key, for
the last ten lists), so locking the phone or reloading the page loses
nothing. Nothing is sent back to Marv.

## The link

`#1` followed by base64url (no padding) of the list, raw-deflated, with
the CRC-32 of the deflated bytes after it. Before deflating, the list is
plain text: parts separated by a blank line; each part's name on its own
line, then one line per thing: a tab first if it is running low, the
name, and a tab and the amount if there is one. A list too long for one
code ends with a line that starts with a tab and names the parts left
off. A link that has been changed or cut short shows a message instead
of a list.

## Hosting

Copy this folder as it is into a repository and serve it with any static
host (GitHub Pages works). There is nothing to build.

The tests in `test/` run with `node --test` in the project the page
comes from.

## Licence

MIT; see `LICENSE`.
