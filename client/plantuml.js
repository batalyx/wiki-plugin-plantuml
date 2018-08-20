"use strict";


(function() {

    // First some utilities that fit comfortably here
    // taken from http://plantuml.com/code-javascript-asynchronous

    function encode64(data) {
        var r = "";
        for (var i=0; i<data.length; i+=3) {
            if (i+2==data.length) {
                r +=append3bytes(data.charCodeAt(i), data.charCodeAt(i+1), 0);
            } else if (i+1==data.length) {
                r += append3bytes(data.charCodeAt(i), 0, 0);
            } else {
                r += append3bytes(data.charCodeAt(i), data.charCodeAt(i+1),
                                  data.charCodeAt(i+2));
            }
        }
        return r;
    }

    function append3bytes(b1, b2, b3) {
        var c1 = b1 >> 2;
        var c2 = ((b1 & 0x3) << 4) | (b2 >> 4);
        var c3 = ((b2 & 0xF) << 2) | (b3 >> 6);
        var c4 = b3 & 0x3F;
        var r = "";
        r += encode6bit(c1 & 0x3F);
        r += encode6bit(c2 & 0x3F);
        r += encode6bit(c3 & 0x3F);
        r += encode6bit(c4 & 0x3F);
        return r;
    }

    function encode6bit(b) {
        if (b < 10) return String.fromCharCode(48 + b);
        b -= 10;
        if (b < 26) return String.fromCharCode(65 + b);
        b -= 26;
        if (b < 26) return String.fromCharCode(97 + b);
        b -= 26;
        if (b == 0) return '-';
        if (b == 1) return '_';
        return '?';
    }

    // SHA256 usage as seen on crypto.subtle examples:

    function sha256(str) {
        var buffer = new TextEncoder("utf-8").encode(str);
        return crypto.subtle.digest("SHA-256", buffer).then(function(hsh) {
            return hex(hsh);
        });
    };

    function hex(buffer) {
        var hexCodes = [];
        var view = new DataView(buffer);
        for (var i = 0; i < view.byteLength; i += 4) {
            // Using getUint32 reduces the number of iterations needed
            // (we process 4 bytes each time)
            var value = view.getUint32(i);
            // toString(16) will give the hex representation of
            // the number without padding
            var stringValue = value.toString(16);
            // We use concatenation and slice for padding
            var padding = '00000000';
            var paddedValue = (padding + stringValue).slice(-padding.length);
            hexCodes.push(paddedValue);
        }

        // Join all the hex strings into one
        return hexCodes.join("");
    };


    // Then the plug-in:

    var expand, emit, bind;

    function fetchAndUrlify(uri) {
        return new Promise( (resolve, reject) => {
            var xmlHTTP;
            xmlHTTP = new XMLHttpRequest();
            xmlHTTP.open('GET', uri, true);
            xmlHTTP.responseType = 'arraybuffer';
            xmlHTTP.onload = function(e) {
                var arr = new Uint8Array(this.response);
                return wiki.getScript('/plugins/plantuml/base64js.min.js', function() {   
                    var b64b = base64js.fromByteArray(arr);
                    var dataURL2 = "data:image/png;base64," + b64b;
                    return resolve(dataURL2);
                });
           };
            xmlHTTP.onerror = function(e) {
                console.error('Error on fetchAndUrlify:' + e);
                return reject(e);
            };
            xmlHTTP.onabort = function(e) {
                console.error('Abort on fetchAndUrlify:' + e);
                return reject(e);
            };
            return xmlHTTP.send();
        });
    };

    // I've not yet fulle resolved Promises myself,
    // so there might be some unneccessary ones present.

    function sha256compare(text, old_hsh) {
        return new Promise(function(resolve, reject) {
            sha256(text).then( new_hsh => {
                if (old_hsh !== new_hsh) return resolve(new_hsh);
                else return reject(new_hsh);
            });
        });
    }

  expand = text => {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*(.+?)\*/g, '<i>$1</i>');
  };

    emit = ($item, item) => {
        let insertImg = ($item, item, caption) => {
            $item.get(0).style.textAlign='center';
            $item.get(0).style.display='block';
            var res=$item.append(`<img src='${item.url}'/>`);
            if (caption) res = $item.append(`<p>${caption}<p/>`);
            return res;
        };

        var uri = "/plantuml/png/"; // Should run server on localuri.
        var text = item.text;
        var uriMatch = item.text.match(/'HOST +(.*)/);
        if (uriMatch != null) {
            uri = expand(uriMatch[1]);
            //text = item.text.substr(uriMatch[0].length).trim();
        }

        var caption = '';
        var captionMatch = item.text.match(/'CAPTION +(.*)/);
        if (captionMatch != null) {
            caption = expand(captionMatch[1]);
        }

        const isGhosted = $item.parents('.page')[0].classList.contains('ghost');

        if (isGhosted) {
            return insertImg($item, item, caption);
        } else {
            // We quess here, that localhost is running a
            // PlantUML server at the path given below.
            // Should this not be the case, give path as
            // the first row on the item.text like:
            // @host https://your.service/path/png/
            // Check
            //   - http://plantuml.com/server
            //   - http://plantuml.com/code-javascript-asynchronous
            //   - http://plantuml.com/code-javascript-synchronous
            //
            // TODO If you need something else than png, be kind
            //      and fix fetchAndurlify too.

            return wiki.getScript('/plugins/plantuml/deflate.js', function() {
                let unescuri = unescape(encodeURIComponent(text));

                // zip_deflate comes from deflate.js
                let encoded_src = encode64(zip_deflate(unescuri, 9));

                var sc = sha256compare(text, item.texthash)
                    .then( (r) => {
                        // item.encoded = encoded_src; // this was a useless idea, possibly
                        item.texthash = r;
                        return fetchAndUrlify(uri + encoded_src);
                    });
                return sc.then( (dta) => {
                    item.url = dta;
                    insertImg($item, item, caption);
                    return wiki.pageHandler.put(
                        $item.parents('.page:first'),
                        {type:'edit',id:item.id,item:item});
                }).catch( (err) => {
                    return insertImg($item, item, caption);
                });
                // return $item; // TODO should this always return an item?
            });
        }
    };

  bind = function($item, item) {
      return $item.dblclick( () => wiki.textEditor($item, item) );
  };

  if (typeof window !== "undefined" && window !== null) {
    window.plugins.plantuml = {emit, bind};
  }

  if (typeof module !== "undefined" && module !== null) {
    module.exports = {expand};
  }

}).call(this);
