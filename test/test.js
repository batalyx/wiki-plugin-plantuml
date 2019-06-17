// build time tests for plantuml plugin
// see http://mochajs.org/

(function() {
  const plantuml = require('../client/plantuml'),
        expect = require('expect.js');

  describe('frame plugin', () => {
    describe('expand', () => {
      it('can make italic', () => {
          var result = plantuml.expand('hello *world*');
        return expect(result).to.be('hello <i>world</i>');
      });
    });
  });

}).call(this);
