(function() {

var hasOwn = (function() {
   var has = Object.hasOwnProperty;
   return function (obj, prop) { return has.call(obj, prop); };
}());

var createObj = (function() {
   var create = Object.create;
   return function () { return create(null); };
}());
   
var isArray = (function() {
   var tostr = Object.prototype.toString;
   return function (o) { return tostr.call(o) === '[object Array]'; }
}());

function noop () { }

function make (type, value) {
   var o = createObj();
   o.type = type;
   o.value = value;
   return o;
}

function makeBool (b) { return b ? O.true : O.false; }
function makeNumber (n) { return make(O.types.number, n); }
function makeString (s) { return make(O.types.string, s); }
function makeNative (n) { return make(O.types.native, n); }

function makeArray (a) {
   var v = [];
   for (var i = 0; i < a.length; i++) { v[i] = makeValue(a[i]); }
   return make(O.types.array, v);
}

function makeObject (o) {
   var v = createObj();
   for (var p in o) { if (hasOwn(o, p)) { v[p] = makeValue(o[p]); } }
   return make(O.types.object, v);
}

function makeValue (v) {
   var t = typeof v;
   if (t === 'undefined' || v === null) { return O.null; }
   if (t === 'boolean' ) { return makeBool  (v); }
   if (t === 'number'  ) { return makeNumber(v); }
   if (t === 'string'  ) { return makeString(v); }
   if (t === 'function') { return makeNative(v); }
   if (t === 'object') {
      return (
         v.type && typeof v.type === 'object' &&
         v.type.type === O.types.type && O.types[v.type.name]
      ) ? v : isArray(v) ? makeArray(v) : makeObject(v);
   }
   return O.null;
}

function tailcall (func, args, cb) {
   var allArgs = cb ? [cb] : [];
   allArgs.push.apply(allArgs, args);
   return { func: func, args: allArgs };
}

function invoke (aTailcall) {
   var tc = (typeof aTailcall === 'function') ? tailcall.apply(null, arguments) : tc;
   while(tc && tc.func) {
      tc = tc.func.apply(null, tc.args || []);
   }
}

var O = window.Objects = createObj();

O.types = {};
O.typeof = function (cb, obj) { return tailcall(cb, [(obj && obj.type) || O.types.null]); };

var types = ['type','null','bool','number','string','array','object','native'];
while(types.length > 0) {
   (function makeType(n) {
      var t = O.types[n] = createObj();
      t.type = O.types.type;
      t.name = n;
      O['is' + n.charAt(0).toUpperCase() + n.substr(1)] = function isTypeN(cb, o) {
         return tailcall(O.typeof, [o], function (t) {
            return tailcall(cb, [t === O.types[n]]);
         });
      };
   }(types.shift()));
}

O.null  = createObj(); O.null .type = O.types.null; O.null .name = 'null';
O.true  = createObj(); O.true .type = O.types.bool; O.true .name = 'true';
O.false = createObj(); O.false.type = O.types.bool; O.false.name = 'false';

// TODO: Maybe args & code & cb should be fields in env. Then "syntax" funcs would take consistent params.
// TODO: Update funcs to return wrapped values (e.g. O.null, O.true, O.false instead of null, true, false)
// TODO: Wrap all O properties, probably by doing: O = makeValue(O)

O.eval = function (cb, code, env) {
   return tailcall(O.typeof, [code], function (type) {
      // Execute native JavaScript
      if (type === O.types.native) {
         return tailcall(code.value, [code, env], cb);
      }
      // If not an object or native, return it as a value (it's not runnable "code")
      if (type !== O.types.object) {
         return tailcall(cb, [code]);
      }
      // Execute an operation defined in env
      return tailcall(O.tryGet, ['op', code], function (hasOp, op) {
         // If there is no operation to perform, just return it as a value
         if (!hasOp) {
            return tailcall(cb, [code]);
         }
         return tailcall(O.typeof, [op], function (opType) {
            // The operation is either computed as code, or looked up as an environment property
            var computeOp = (opType === O.types.object) ? O.eval : O.lookup;
            return tailcall(computeOp, [op, env], function (func) {
               return tailcall(O.get, ['args', code], function (args) {
                  args = args || [];
                  var newEnv = makeObject({ parent: env });
                  // TODO: instead of just setting 'args', set each args as property of newEnv
                  return tailcall(O.set, ['args', [], newEnv], function (callArgs) {
                     return tailcall(O.get, ['syntax', func], function (isSyntax) {
                        // Execute a syntax-function (operates on unevaluated arguments)
                        if (isSyntax) {
                           callArgs.push.apply(callArgs, args);
                           return tailcall(O.eval, [func, newEnv], cb);
                        }
                        // Evaluate each argument, then pass them into the operation
                        function nextArg (cb, i) {
                           // Invoke the operation once all args are evaluated:
                           if (i >= args.length) {
                              return tailcall(O.eval, [func, newEnv], cb);
                           }
                           // Evaluate the next argument:
                           return tailcall(O.eval, [argsExps[i], env], function (a) {
                              callArgs.push(a);
                              return tailcall(nextArg, [i+1], cb);
                           });
                        }
                        return tailcall(nextArg, [0], cb);
                     });
                  });
               });
            });
         });
      });
   });
};

O.has = function (cb, prop, obj) {
   return tailcall(O.typeof, [obj], function (t) {
      return tailcall(cb, [
         (t === O.types.object || t === O.types.array) && hasOwn(obj.value, prop)
      ]);
   });
};

O.get = function (cb, prop, obj) {
   return tailcall(O.has, [obj, prop], function (h) {
      return tailcall(cb, [h ? obj.value[prop] : O.null]);
   });
};

O.tryGet = function (cb, prop, obj) {
   return tailcall(O.typeof, [obj], function (t) {
      var h = (t === O.types.object || t === O.types.array) && hasOwn(obj.value, prop);
      var v = (h ? obj.value[prop] : O.null);
      return tailcall(cb, [h, v]);
   });
};

O.set = function (cb, prop, value, obj) {
   return tailcall(O.typeof, [obj], function (t) {
      if (t === O.types.object || t === O.types.array) {
         obj.value[prop] = value;
      }
      return tailcall(cb, [value]);
   });
};

O.lookup = function (cb, prop, env) {
   return tailcall(O.tryGet, [prop, env], function (has, value) {
      if (has) { return tailcall(cb, [value]); }
      return tailcall(O.tryGet, ['parent', env], function (has, parent) {
         if (!has) { return tailcall(cb, [O.null]); }
         return tailcall(O.lookup, [prop, parent], cb);
      });
   });
};

// ------------------------------------------ //
// TEMPORARY HOOKS FOR TESTING PURPOSES ONLY: //
// ------------------------------------------ //

function unmake(cb, v) {
   if (v === O.null ) { return tailcall(cb, [null ]); }
   if (v === O.true ) { return tailcall(cb, [true ]); }
   if (v === O.false) { return tailcall(cb, [false]); }
   return tailcall(O.typeof, [v], function (t) {
      if (t === O.types.object || t === O.types.array) {
         var nv = (t === O.types.object) ? createObj() : [];
         var next = function () {
            return tailcall(cb, [nv]);
         };
         for (var p in v.value) {
            if (hasOwn(v.value, p)) {
               next = (function (next, k, v) {
                  return function () {
                     return tailcall(unmake, [v], function(v) {
                        nv[k] = v; return tailcall(next);
                     });
                  };
               }(next, p, v.value[p]));
            }
         }
         return tailcall(next);
      }
      return tailcall(cb, [v.value]);
   });
}

O.Test = {
   make: makeValue,
   run: function (code, env, cb) {
      cb = arguments[arguments.length - 1];
      if (typeof cb !== 'function') { cb = function (v) { console.log(v); }; }
      if (typeof env !== 'object' || !env) { env = O; }
      code = makeValue(code);
      invoke(O.eval, [code, env], function (ret) {
         return tailcall(unmake, [ret], cb);
      }); 
   }
};

}());
