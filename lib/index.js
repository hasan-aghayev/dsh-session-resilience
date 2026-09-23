import { defineTool } from "@deepseek-ai/dsh-tools";
import { SessionId } from "@deepseek-ai/dsh-session";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { spawn } from "node:child_process";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
//#region ../deepseek-harness/vendor/cosmokit/src/misc.ts
/** Return true when a value is `null` or `undefined`. */
function isNullable(value) {
	return value === null || value === void 0;
}
/** Return true for non-array object values. */
function isPlainObject(data) {
	return data && typeof data === "object" && !Array.isArray(data);
}
/** Filter object entries and return a new object. */
function filterKeys(object, filter) {
	return Object.fromEntries(Object.entries(object).filter(([key, value]) => filter(key, value)));
}
/** Map object values while preserving the original key set. */
function mapValues(object, transform) {
	return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, transform(value, key)]));
}
/** Pick selected keys from an object, optionally including `undefined` values. */
function pick(source, keys, forced) {
	if (!keys) return { ...source };
	const result = {};
	for (const key of keys) if (forced || source[key] !== void 0) result[key] = source[key];
	return result;
}
//#endregion
//#region ../deepseek-harness/vendor/cosmokit/src/volatile.ts
/** Shared config references used by schema validators and plugin runtimes. */
const write = Symbol.for("cosmokit.volatile.write");
function snapshot(value, ancestors = /* @__PURE__ */ new Set()) {
	if (typeof value === "function") throw new TypeError("volatile config cannot contain functions");
	if (value === null || typeof value !== "object") return value;
	if (ancestors.has(value)) throw new TypeError("volatile config cannot contain cycles");
	ancestors.add(value);
	try {
		if (Array.isArray(value)) return Object.freeze(value.map((item) => snapshot(item, ancestors)));
		if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError("volatile config objects must be plain objects or arrays");
		return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, snapshot(item, ancestors)])));
	} finally {
		ancestors.delete(value);
	}
}
/**
* Create a detached reference containing an immutable copy of the supplied data.
* @param value - validated config data; class instances and functions are unsupported.
* @returns a reference whose value is updated only by its owning runtime.
*/
function createVolatile(value) {
	let current = snapshot(value);
	return Object.freeze({
		get: () => current,
		[write]: (value) => {
			current = value;
		}
	});
}
/**
* Identify references across ESM/CJS copies of the shared library.
* @param value - a parsed config value.
* @returns whether the value implements the shared reference protocol.
*/
function isVolatile(value) {
	return typeof value === "object" && value !== null && write in value;
}
//#endregion
//#region ../deepseek-harness/vendor/cosmokit/src/types.ts
/** Test values using `instanceof` with a `toStringTag` fallback. */
function is(type, value) {
	if (arguments.length === 1) return (value) => is(type, value);
	return type in globalThis && value instanceof globalThis[type] || Object.prototype.toString.call(value).slice(8, -1) === type;
}
function isArrayBufferLike(value) {
	return is("ArrayBuffer", value) || is("SharedArrayBuffer", value);
}
function isArrayBufferSource(value) {
	return isArrayBufferLike(value) || ArrayBuffer.isView(value);
}
let Binary;
(function(_Binary) {
	_Binary.is = isArrayBufferLike;
	_Binary.isSource = isArrayBufferSource;
	function fromSource(source) {
		if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
		else return source;
	}
	_Binary.fromSource = fromSource;
	function toBase64(source) {
		source = fromSource(source);
		if (typeof Buffer !== "undefined") return Buffer.from(source).toString("base64");
		let binary = "";
		const bytes = new Uint8Array(source);
		for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
		return btoa(binary);
	}
	_Binary.toBase64 = toBase64;
	function fromBase64(source) {
		if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "base64"));
		return Uint8Array.from(atob(source), (c) => c.charCodeAt(0));
	}
	_Binary.fromBase64 = fromBase64;
	function toHex(source) {
		source = fromSource(source);
		if (typeof Buffer !== "undefined") return Buffer.from(source).toString("hex");
		return Array.from(new Uint8Array(source), (byte) => byte.toString(16).padStart(2, "0")).join("");
	}
	_Binary.toHex = toHex;
	function fromHex(source) {
		if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "hex"));
		const hex = source.length % 2 === 0 ? source : source.slice(0, source.length - 1);
		const buffer = [];
		for (let i = 0; i < hex.length; i += 2) buffer.push(parseInt(`${hex[i]}${hex[i + 1]}`, 16));
		return Uint8Array.from(buffer).buffer;
	}
	_Binary.fromHex = fromHex;
})(Binary || (Binary = {}));
Binary.fromBase64;
Binary.toBase64;
Binary.fromHex;
Binary.toHex;
/** Deep-clone common JavaScript values while preserving prototypes and cycles. */
function clone(source, refs = /* @__PURE__ */ new Map()) {
	if (!source || typeof source !== "object") return source;
	if (is("Date", source)) return new Date(source.valueOf());
	if (is("RegExp", source)) return new RegExp(source.source, source.flags);
	if (isArrayBufferLike(source)) return source.slice(0);
	if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
	const cached = refs.get(source);
	if (cached) return cached;
	if (Array.isArray(source)) {
		const result = [];
		refs.set(source, result);
		source.forEach((value, index) => {
			result[index] = Reflect.apply(clone, null, [value, refs]);
		});
		return result;
	}
	const result = Object.create(Object.getPrototypeOf(source));
	refs.set(source, result);
	for (const key of Reflect.ownKeys(source)) {
		const descriptor = { ...Reflect.getOwnPropertyDescriptor(source, key) };
		if ("value" in descriptor) descriptor.value = Reflect.apply(clone, null, [descriptor.value, refs]);
		Reflect.defineProperty(result, key, descriptor);
	}
	return result;
}
/**
* Compare values recursively, treating two volatile references as equal regardless of value.
* Strict comparison distinguishes null/undefined, treats opaque objects by identity,
* compares URLs by normalized href, treats array holes as undefined, and considers distinct cyclic structures unequal.
* @param a - first value.
* @param b - second value.
* @param strict - whether to require strict data equality outside volatile references.
* @returns whether the values compare equal.
*/
function deepEqual(a, b, strict) {
	const ancestors = /* @__PURE__ */ new Set();
	function compare(a, b) {
		if (a === b) return true;
		if (isVolatile(a) || isVolatile(b)) return isVolatile(a) && isVolatile(b);
		if (!strict && isNullable(a) && isNullable(b)) return true;
		if (typeof a !== typeof b || typeof a !== "object" || !a || !b) return false;
		if (ancestors.has(a)) return false;
		function check(test, then) {
			return test(a) ? test(b) ? then(a, b) : false : test(b) ? false : void 0;
		}
		ancestors.add(a);
		try {
			return check(Array.isArray, (a, b) => {
				if (a.length !== b.length) return false;
				for (let index = 0; index < a.length; index++) if (!compare(a[index], b[index])) return false;
				return true;
			}) ?? check(is("Date"), (a, b) => a.valueOf() === b.valueOf()) ?? check(is("URL"), (a, b) => a.href === b.href) ?? check(is("RegExp"), (a, b) => a.source === b.source && a.flags === b.flags) ?? check(isArrayBufferLike, (a, b) => {
				if (a.byteLength !== b.byteLength) return false;
				const viewA = new Uint8Array(a);
				const viewB = new Uint8Array(b);
				for (let i = 0; i < viewA.length; i++) if (viewA[i] !== viewB[i]) return false;
				return true;
			}) ?? ((!strict || [a, b].every((value) => Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) && Object.keys({
				...a,
				...b
			}).every((key) => compare(a[key], b[key])));
		} finally {
			ancestors.delete(a);
		}
	}
	return compare(a, b);
}
//#endregion
//#region ../deepseek-harness/vendor/cosmokit/src/time.ts
let Time;
(function(_Time) {
	_Time.millisecond = 1;
	const second = _Time.second = 1e3;
	const minute = _Time.minute = second * 60;
	const hour = _Time.hour = minute * 60;
	const day = _Time.day = hour * 24;
	const week = _Time.week = day * 7;
	let timezoneOffset = (/* @__PURE__ */ new Date()).getTimezoneOffset();
	function setTimezoneOffset(offset) {
		timezoneOffset = offset;
	}
	_Time.setTimezoneOffset = setTimezoneOffset;
	function getTimezoneOffset() {
		return timezoneOffset;
	}
	_Time.getTimezoneOffset = getTimezoneOffset;
	function getDateNumber(date = /* @__PURE__ */ new Date(), offset) {
		if (typeof date === "number") date = new Date(date);
		if (offset === void 0) offset = timezoneOffset;
		return Math.floor((date.valueOf() / minute - offset) / 1440);
	}
	_Time.getDateNumber = getDateNumber;
	function fromDateNumber(value, offset) {
		const date = new Date(value * day);
		if (offset === void 0) offset = timezoneOffset;
		return new Date(+date + offset * minute);
	}
	_Time.fromDateNumber = fromDateNumber;
	const numeric = /\d+(?:\.\d+)?/.source;
	const timeRegExp = new RegExp(`^${[
		"w(?:eek(?:s)?)?",
		"d(?:ay(?:s)?)?",
		"h(?:our(?:s)?)?",
		"m(?:in(?:ute)?(?:s)?)?",
		"s(?:ec(?:ond)?(?:s)?)?"
	].map((unit) => `(${numeric}${unit})?`).join("")}$`);
	function parseTime(source) {
		const capture = timeRegExp.exec(source);
		if (!capture) return 0;
		return (parseFloat(capture[1]) * week || 0) + (parseFloat(capture[2]) * day || 0) + (parseFloat(capture[3]) * hour || 0) + (parseFloat(capture[4]) * minute || 0) + (parseFloat(capture[5]) * second || 0);
	}
	_Time.parseTime = parseTime;
	function parseDate(date) {
		const parsed = parseTime(date);
		if (parsed) date = Date.now() + parsed;
		else if (/^\d{1,2}(:\d{1,2}){1,2}$/.test(date)) date = `${(/* @__PURE__ */ new Date()).toLocaleDateString()}-${date}`;
		else if (/^\d{1,2}-\d{1,2}-\d{1,2}(:\d{1,2}){1,2}$/.test(date)) date = `${(/* @__PURE__ */ new Date()).getFullYear()}-${date}`;
		return date ? new Date(date) : /* @__PURE__ */ new Date();
	}
	_Time.parseDate = parseDate;
	function format(ms) {
		const abs = Math.abs(ms);
		if (abs >= day - hour / 2) return Math.round(ms / day) + "d";
		else if (abs >= hour - minute / 2) return Math.round(ms / hour) + "h";
		else if (abs >= minute - second / 2) return Math.round(ms / minute) + "m";
		else if (abs >= second) return Math.round(ms / second) + "s";
		return ms + "ms";
	}
	_Time.format = format;
	function toDigits(source, length = 2) {
		return source.toString().padStart(length, "0");
	}
	_Time.toDigits = toDigits;
	function template(template, time = /* @__PURE__ */ new Date()) {
		return template.replace("yyyy", time.getFullYear().toString()).replace("yy", time.getFullYear().toString().slice(2)).replace("MM", toDigits(time.getMonth() + 1)).replace("dd", toDigits(time.getDate())).replace("hh", toDigits(time.getHours())).replace("mm", toDigits(time.getMinutes())).replace("ss", toDigits(time.getSeconds())).replace("SSS", toDigits(time.getMilliseconds(), 3));
	}
	_Time.template = template;
})(Time || (Time = {}));
//#endregion
//#region ../deepseek-harness/vendor/schemastery/lib/index.mjs
const kSchema = Symbol.for("schemastery");
const kValidationError = Symbol.for("ValidationError");
globalThis.__schemastery_index__ ??= 0;
globalThis.__schemastery_refs__ = void 0;
var ValidationError = class extends TypeError {
	options;
	name = "ValidationError";
	constructor(message, options) {
		let prefix = "$";
		for (const segment of options.path || []) if (typeof segment === "string") prefix += "." + segment;
		else if (typeof segment === "number") prefix += "[" + segment + "]";
		else if (typeof segment === "symbol") prefix += `[Symbol(${segment.toString()})]`;
		if (prefix.startsWith(".")) prefix = prefix.slice(1);
		super((prefix === "$" ? "" : `${prefix} `) + message);
		this.options = options;
	}
	static is(error) {
		return !!error?.[kValidationError];
	}
};
Object.defineProperty(ValidationError.prototype, kValidationError, { value: true });
const Schema = function(options) {
	const schema = function(data, options = {}) {
		return Schema.resolve(data, schema, options)[0];
	};
	if (options.refs) {
		const refs = mapValues(options.refs, (options) => new Schema(options));
		const getRef = (uid) => refs[uid];
		for (const key in refs) {
			const options = refs[key];
			options.sKey = getRef(options.sKey);
			options.inner = getRef(options.inner);
			options.list = options.list && options.list.map(getRef);
			options.dict = options.dict && mapValues(options.dict, getRef);
		}
		return refs[options.uid];
	}
	Object.assign(schema, options);
	if (typeof schema.callback === "string") try {
		schema.callback = new Function("return " + schema.callback)();
	} catch {}
	Object.defineProperty(schema, "uid", { value: globalThis.__schemastery_index__++ });
	Object.setPrototypeOf(schema, Schema.prototype);
	schema.meta ||= {};
	schema.toString = schema.toString.bind(schema);
	return schema;
};
Schema.prototype = Object.create(Function.prototype);
Schema.prototype[kSchema] = true;
Object.defineProperty(Schema.prototype, "~standard", { get() {
	return {
		version: 1,
		vendor: "schemastery",
		validate: (value) => {
			try {
				return { value: Schema.resolve(value, this, {})[0] };
			} catch (error) {
				if (ValidationError.is(error)) return { issues: [{
					message: error.message,
					path: error.options.path
				}] };
				throw error;
			}
		}
	};
} });
Schema.ValidationError = ValidationError;
Schema.prototype.toJSON = function toJSON() {
	if (globalThis.__schemastery_refs__) {
		globalThis.__schemastery_refs__[this.uid] ??= JSON.parse(JSON.stringify({ ...this }));
		return this.uid;
	}
	globalThis.__schemastery_refs__ = { [this.uid]: { ...this } };
	globalThis.__schemastery_refs__[this.uid] = JSON.parse(JSON.stringify({ ...this }));
	const result = {
		uid: this.uid,
		refs: globalThis.__schemastery_refs__
	};
	globalThis.__schemastery_refs__ = void 0;
	return result;
};
Schema.prototype.set = function set(key, value) {
	this.dict[key] = value;
	return this;
};
Schema.prototype.push = function push(value) {
	this.list.push(value);
	return this;
};
function mergeDesc(original, messages) {
	const result = typeof original === "string" ? { "": original } : { ...original };
	for (const locale in messages) {
		const value = messages[locale];
		if (value?.$description || value?.$desc) result[locale] = value.$description || value.$desc;
		else if (typeof value === "string") result[locale] = value;
	}
	return result;
}
function getInner(value) {
	return value?.$value ?? value?.$inner;
}
function extractKeys(data) {
	return filterKeys(data ?? {}, (key) => !key.startsWith("$"));
}
Schema.prototype.i18n = function i18n(messages) {
	const schema = Schema(this);
	const desc = mergeDesc(schema.meta.description, messages);
	if (Object.keys(desc).length) schema.meta.description = desc;
	if (schema.dict) schema.dict = mapValues(schema.dict, (inner, key) => {
		return inner.i18n(mapValues(messages, (data) => getInner(data)?.[key] ?? data?.[key]));
	});
	if (schema.list) schema.list = schema.list.map((inner, index) => {
		return inner.i18n(mapValues(messages, (data = {}) => {
			if (Array.isArray(getInner(data))) return getInner(data)[index];
			if (Array.isArray(data)) return data[index];
			return extractKeys(data);
		}));
	});
	if (schema.inner) schema.inner = schema.inner.i18n(mapValues(messages, (data) => {
		if (getInner(data)) return getInner(data);
		return extractKeys(data);
	}));
	if (schema.sKey) schema.sKey = schema.sKey.i18n(mapValues(messages, (data) => data?.$key));
	return schema;
};
Schema.prototype.extra = function extra(key, value) {
	const schema = Schema(this);
	schema.meta = {
		...schema.meta,
		[key]: value
	};
	return schema;
};
for (const key of [
	"required",
	"disabled",
	"collapse",
	"hidden",
	"loose"
]) Object.assign(Schema.prototype, { [key](value = true) {
	const schema = Schema(this);
	schema.meta = {
		...schema.meta,
		[key]: value
	};
	return schema;
} });
Schema.prototype.deprecated = function deprecated() {
	const schema = Schema(this);
	schema.meta.badges ||= [];
	schema.meta.badges.push({
		text: "deprecated",
		type: "danger"
	});
	return schema;
};
Schema.prototype.experimental = function experimental() {
	const schema = Schema(this);
	schema.meta.badges ||= [];
	schema.meta.badges.push({
		text: "experimental",
		type: "warning"
	});
	return schema;
};
Schema.prototype.pattern = function pattern(regexp) {
	const schema = Schema(this);
	const pattern = pick(regexp, ["source", "flags"]);
	schema.meta = {
		...schema.meta,
		pattern
	};
	return schema;
};
Schema.prototype.simplify = function simplify(value) {
	if (isVolatile(value)) value = value.get();
	if (deepEqual(value, this.meta.default, this.type === "dict")) return null;
	if (isNullable(value)) return value;
	if (this.type === "object" || this.type === "dict") {
		const result = {};
		for (const key in value) {
			const item = (this.type === "object" ? this.dict[key] : this.inner)?.simplify(value[key]);
			if (this.type === "dict" || !isNullable(item)) result[key] = item;
		}
		if (deepEqual(result, this.meta.default, this.type === "dict")) return null;
		return result;
	} else if (this.type === "array" || this.type === "tuple") {
		const result = [];
		value.forEach((value, index) => {
			const schema = this.type === "array" ? this.inner : this.list[index];
			const item = schema ? schema.simplify(value) : value;
			result.push(item);
		});
		return result;
	} else if (this.type === "intersect") {
		const result = {};
		for (const item of this.list) Object.assign(result, item.simplify(value));
		return result;
	} else if (this.type === "union") for (const schema of this.list) try {
		Schema.resolve(value, schema, {});
		return schema.simplify(value);
	} catch {}
	return value;
};
Schema.prototype.toString = function toString(inline) {
	return formatters[this.type]?.(this, inline) ?? `Schema<${this.type}>`;
};
Schema.prototype.role = function role(role, extra) {
	const schema = Schema(this);
	schema.meta = {
		...schema.meta,
		role,
		extra
	};
	return schema;
};
for (const key of [
	"default",
	"link",
	"comment",
	"description",
	"max",
	"min",
	"step"
]) Object.assign(Schema.prototype, { [key](value) {
	const schema = Schema(this);
	schema.meta = {
		...schema.meta,
		[key]: value
	};
	return schema;
} });
Schema.prototype.volatile = function volatile() {
	if (this.meta.volatile) throw new TypeError("volatile schema is already wrapped");
	return this.extra("volatile", true);
};
const resolvers = {};
const checkedVolatile = Symbol("checked-volatile-schema");
function validateVolatileSchema(schema, path = [], blocked = false, seen = /* @__PURE__ */ new Map()) {
	const states = seen.get(schema) ?? /* @__PURE__ */ new Set();
	if (states.has(blocked)) return;
	states.add(blocked);
	seen.set(schema, states);
	if (schema.meta?.volatile && blocked) throw new ValidationError("volatile fields require a fixed object path without an enclosing volatile field", { path });
	const nested = blocked || !!schema.meta?.volatile;
	if (schema.dict) for (const [key, child] of Object.entries(schema.dict)) validateVolatileSchema(child, [...path, key], nested, seen);
	if (schema.sKey) validateVolatileSchema(schema.sKey, [...path, "<key>"], true, seen);
	if (schema.inner && (schema.type !== "lazy" || schema.inner[kSchema])) validateVolatileSchema(schema.inner, [...path, "*"], true, seen);
	if (schema.list) for (let index = 0; index < schema.list.length; index++) validateVolatileSchema(schema.list[index], [...path, String(index)], true, seen);
}
Schema.extend = function extend(type, resolve) {
	resolvers[type] = resolve;
};
Schema.resolve = function resolve(data, schema, options = {}, strict = false) {
	if (!schema) return [data];
	if (!options[checkedVolatile]) {
		validateVolatileSchema(schema, options.path);
		options = {
			...options,
			[checkedVolatile]: true
		};
	}
	if (schema.meta?.volatile) {
		const inner = Schema(schema);
		inner.meta = {
			...schema.meta,
			volatile: false
		};
		const [value, adapted] = Schema.resolve(data, inner, options, strict);
		try {
			return [createVolatile(value), adapted];
		} catch (error) {
			throw new ValidationError(error instanceof Error ? error.message : String(error), options);
		}
	}
	if (options.ignore?.(data, schema)) return [data];
	if (isNullable(data) && schema.type !== "lazy") {
		if (schema.meta.required) throw new ValidationError(`missing required value`, options);
		let current = schema;
		let fallback = schema.meta.default;
		while (current?.type === "intersect" && isNullable(fallback)) {
			current = current.list[0];
			fallback = current?.meta.default;
		}
		if (isNullable(fallback)) return [data];
		data = clone(fallback);
	}
	const callback = resolvers[schema.type];
	if (!callback) throw new ValidationError(`unsupported type "${schema.type}"`, options);
	try {
		return callback(data, schema, options, strict);
	} catch (error) {
		if (!schema.meta.loose) throw error;
		return [schema.meta.default];
	}
};
Schema.from = function from(source) {
	if (isNullable(source)) return Schema.any();
	else if ([
		"string",
		"number",
		"boolean"
	].includes(typeof source)) return Schema.const(source).required();
	else if (source[kSchema]) return source;
	else if (typeof source === "function") switch (source) {
		case String: return Schema.string().required();
		case Number: return Schema.number().required();
		case Boolean: return Schema.boolean().required();
		case Function: return Schema.function().required();
		default: return Schema.is(source).required();
	}
	else throw new TypeError(`cannot infer schema from ${source}`);
};
Schema.lazy = function lazy(builder) {
	const toJSON = () => {
		if (!schema.inner[kSchema]) {
			schema.inner = schema.builder();
			schema.inner.meta = {
				...schema.meta,
				...schema.inner.meta
			};
		}
		return schema.inner.toJSON();
	};
	const schema = new Schema({
		type: "lazy",
		builder,
		inner: { toJSON }
	});
	return schema;
};
Schema.natural = function natural() {
	return Schema.number().step(1).min(0);
};
Schema.percent = function percent() {
	return Schema.number().step(.01).min(0).max(1).role("slider");
};
Schema.date = function date() {
	return Schema.union([Schema.is(Date), Schema.transform(Schema.string().role("datetime"), (value, options) => {
		const date = new Date(value);
		if (isNaN(+date)) throw new ValidationError(`invalid date "${value}"`, options);
		return date;
	}, true)]);
};
Schema.regExp = function regExp(flag = "") {
	return Schema.union([Schema.is(RegExp), Schema.transform(Schema.string().role("regexp", { flag }), (value, options) => {
		try {
			return new RegExp(value, flag);
		} catch (e) {
			throw new ValidationError(e.message, options);
		}
	}, true)]);
};
Schema.arrayBuffer = function arrayBuffer(encoding) {
	return Schema.union([
		Schema.is(ArrayBuffer),
		Schema.is(SharedArrayBuffer),
		Schema.transform(Schema.any(), (value, options) => {
			if (Binary.isSource(value)) return Binary.fromSource(value);
			throw new ValidationError(`expected ArrayBufferSource but got ${value}`, options);
		}, true),
		...encoding ? [Schema.transform(Schema.string(), (value, options) => {
			try {
				return encoding === "base64" ? Binary.fromBase64(value) : Binary.fromHex(value);
			} catch (e) {
				throw new ValidationError(e.message, options);
			}
		}, true)] : []
	]);
};
Schema.extend("lazy", (data, schema, options, strict) => {
	if (!schema.inner[kSchema]) {
		schema.inner = schema.builder();
		schema.inner.meta = {
			...schema.meta,
			...schema.inner.meta
		};
		validateVolatileSchema(schema.inner, options.path, true);
	}
	return Schema.resolve(data, schema.inner, options, strict);
});
Schema.extend("any", (data) => {
	return [data];
});
Schema.extend("never", (data, _, options) => {
	throw new ValidationError(`expected nullable but got ${data}`, options);
});
Schema.extend("const", (data, { value }, options) => {
	if (deepEqual(data, value)) return [value];
	throw new ValidationError(`expected ${value} but got ${data}`, options);
});
function checkWithinRange(data, meta, description, options, skipMin = false) {
	const { max = Infinity, min = -Infinity } = meta;
	if (data > max) throw new ValidationError(`expected ${description} <= ${max} but got ${data}`, options);
	if (data < min && !skipMin) throw new ValidationError(`expected ${description} >= ${min} but got ${data}`, options);
}
Schema.extend("string", (data, { meta }, options) => {
	if (typeof data !== "string") throw new ValidationError(`expected string but got ${data}`, options);
	if (meta.pattern) {
		const regexp = new RegExp(meta.pattern.source, meta.pattern.flags);
		if (!regexp.test(data)) throw new ValidationError(`expect string to match regexp ${regexp}`, options);
	}
	checkWithinRange(data.length, meta, "string length", options);
	return [data];
});
function decimalShift(data, digits) {
	const str = data.toString();
	if (str.includes("e")) return data * Math.pow(10, digits);
	const index = str.indexOf(".");
	if (index === -1) return data * Math.pow(10, digits);
	const frac = str.slice(index + 1);
	const integer = str.slice(0, index);
	if (frac.length <= digits) return +(integer + frac.padEnd(digits, "0"));
	return +(integer + frac.slice(0, digits) + "." + frac.slice(digits));
}
function isMultipleOf(data, min, step) {
	step = Math.abs(step);
	if (!/^\d+\.\d+$/.test(step.toString())) return (data - min) % step === 0;
	const index = step.toString().indexOf(".");
	const digits = step.toString().slice(index + 1).length;
	return Math.abs(decimalShift(data, digits) - decimalShift(min, digits)) % decimalShift(step, digits) === 0;
}
Schema.extend("number", (data, { meta }, options) => {
	if (typeof data !== "number") throw new ValidationError(`expected number but got ${data}`, options);
	checkWithinRange(data, meta, "number", options);
	const { step } = meta;
	if (step && !isMultipleOf(data, meta.min ?? 0, step)) throw new ValidationError(`expected number multiple of ${step} but got ${data}`, options);
	return [data];
});
Schema.extend("boolean", (data, _, options) => {
	if (typeof data === "boolean") return [data];
	throw new ValidationError(`expected boolean but got ${data}`, options);
});
Schema.extend("bitset", (data, { bits, meta }, options) => {
	let value = 0, keys = [];
	if (typeof data === "number") {
		value = data;
		for (const key in bits) if (data & bits[key]) keys.push(key);
	} else if (Array.isArray(data)) {
		keys = data;
		for (const key of keys) {
			if (typeof key !== "string") throw new ValidationError(`expected string but got ${key}`, options);
			if (key in bits) value |= bits[key];
		}
	} else throw new ValidationError(`expected number or array but got ${data}`, options);
	if (value === meta.default) return [value];
	return [value, keys];
});
Schema.extend("function", (data, _, options) => {
	if (typeof data === "function") return [data];
	throw new ValidationError(`expected function but got ${data}`, options);
});
Schema.extend("is", (data, { constructor }, options) => {
	if (typeof constructor === "function") {
		if (data instanceof constructor) return [data];
		throw new ValidationError(`expected ${constructor.name} but got ${data}`, options);
	} else {
		if (isNullable(data)) throw new ValidationError(`expected ${constructor} but got ${data}`, options);
		let prototype = Object.getPrototypeOf(data);
		while (prototype) {
			if (prototype.constructor?.name === constructor) return [data];
			prototype = Object.getPrototypeOf(prototype);
		}
		throw new ValidationError(`expected ${constructor} but got ${data}`, options);
	}
});
function property(data, key, schema, options) {
	try {
		const [value, adapted] = Schema.resolve(data[key], schema, {
			...options,
			path: [...options.path || [], key]
		});
		if (adapted !== void 0) data[key] = adapted;
		return value;
	} catch (e) {
		if (!options?.autofix) throw e;
		delete data[key];
		return schema.meta.volatile ? createVolatile(schema.meta.default) : schema.meta.default;
	}
}
Schema.extend("array", (data, { inner, meta }, options) => {
	if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
	checkWithinRange(data.length, meta, "array length", options, !isNullable(inner.meta.default));
	return [data.map((_, index) => property(data, index, inner, options))];
});
Schema.extend("dict", (data, { inner, sKey }, options, strict) => {
	if (!isPlainObject(data)) throw new ValidationError(`expected object but got ${data}`, options);
	const result = {};
	for (const key in data) {
		let rKey;
		try {
			rKey = Schema.resolve(key, sKey, options)[0];
		} catch (error) {
			if (strict) continue;
			throw error;
		}
		result[rKey] = property(data, key, inner, options);
		data[rKey] = data[key];
		if (key !== rKey) delete data[key];
	}
	return [result];
});
Schema.extend("tuple", (data, { list }, options, strict) => {
	if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
	const result = list.map((inner, index) => property(data, index, inner, options));
	if (strict) return [result];
	result.push(...data.slice(list.length));
	return [result];
});
function merge(result, data) {
	for (const key in data) {
		if (key in result) continue;
		result[key] = data[key];
	}
}
Schema.extend("object", (data, { dict }, options, strict) => {
	if (!isPlainObject(data)) throw new ValidationError(`expected object but got ${data}`, options);
	const result = {};
	for (const key in dict) {
		const value = property(data, key, dict[key], options);
		if (!isNullable(value) || key in data) result[key] = value;
	}
	if (!strict) merge(result, data);
	return [result];
});
Schema.extend("union", (data, { list, toString }, options, strict) => {
	const messages = [];
	for (const inner of list) try {
		return Schema.resolve(data, inner, options, strict);
	} catch (error) {
		messages.push(error);
	}
	throw new ValidationError(`expected ${toString()} but got ${JSON.stringify(data)}`, options);
});
Schema.extend("intersect", (data, { list, toString }, options, strict) => {
	if (!list.length) return [data];
	let result;
	for (const inner of list) {
		const value = Schema.resolve(data, inner, options, true)[0];
		if (isNullable(value)) continue;
		if (isNullable(result)) result = value;
		else if (typeof result !== typeof value) throw new ValidationError(`expected ${toString()} but got ${JSON.stringify(data)}`, options);
		else if (typeof value === "object") merge(result ??= {}, value);
		else if (result !== value) throw new ValidationError(`expected ${toString()} but got ${JSON.stringify(data)}`, options);
	}
	if (!strict && isPlainObject(data)) merge(result, data);
	return [result];
});
Schema.extend("transform", (data, { inner, callback, preserve }, options) => {
	const [result, adapted = data] = Schema.resolve(data, inner, options, true);
	if (preserve) return [callback(result)];
	else return [callback(result), callback(adapted)];
});
const formatters = {};
function defineMethod(name, keys, format) {
	formatters[name] = format;
	Object.assign(Schema, { [name](...args) {
		const schema = new Schema({ type: name });
		keys.forEach((key, index) => {
			switch (key) {
				case "sKey":
					schema.sKey = args[index] ?? Schema.string();
					break;
				case "inner":
					schema.inner = Schema.from(args[index]);
					break;
				case "list":
					schema.list = args[index].map(Schema.from);
					break;
				case "dict":
					schema.dict = mapValues(args[index], Schema.from);
					break;
				case "bits":
					schema.bits = {};
					for (const key in args[index]) {
						if (typeof args[index][key] !== "number") continue;
						schema.bits[key] = args[index][key];
					}
					break;
				case "callback": {
					const callback = schema.callback = args[index];
					callback["toJSON"] ||= () => callback.toString();
					break;
				}
				case "constructor": {
					const constructor = schema.constructor = args[index];
					if (typeof constructor === "function") constructor["toJSON"] ||= () => constructor["name"];
					break;
				}
				default: schema[key] = args[index];
			}
		});
		if (name === "object" || name === "dict") schema.meta.default = {};
		else if (name === "array" || name === "tuple") schema.meta.default = [];
		else if (name === "bitset") schema.meta.default = 0;
		return schema;
	} });
}
defineMethod("is", ["constructor"], ({ constructor }) => {
	if (typeof constructor === "function") return constructor.name;
	else return constructor;
});
defineMethod("any", [], () => "any");
defineMethod("never", [], () => "never");
defineMethod("const", ["value"], ({ value }) => typeof value === "string" ? JSON.stringify(value) : value);
defineMethod("string", [], () => "string");
defineMethod("number", [], () => "number");
defineMethod("boolean", [], () => "boolean");
defineMethod("bitset", ["bits"], () => "bitset");
defineMethod("function", [], () => "function");
defineMethod("array", ["inner"], ({ inner }) => `${inner.toString(true)}[]`);
defineMethod("dict", ["inner", "sKey"], ({ inner, sKey }) => `{ [key: ${sKey.toString()}]: ${inner.toString()} }`);
defineMethod("tuple", ["list"], ({ list }) => `[${list.map((inner) => inner.toString()).join(", ")}]`);
defineMethod("object", ["dict"], ({ dict }) => {
	if (Object.keys(dict).length === 0) return "{}";
	return `{ ${Object.entries(dict).map(([key, inner]) => {
		return `${key}${inner.meta.required ? "" : "?"}: ${inner.toString()}`;
	}).join(", ")} }`;
});
defineMethod("union", ["list"], ({ list }, inline) => {
	const result = list.map(({ toString: format }) => format()).join(" | ");
	return inline ? `(${result})` : result;
});
defineMethod("intersect", ["list"], ({ list }) => {
	return `${list.map((inner) => inner.toString(true)).join(" & ")}`;
});
defineMethod("transform", [
	"inner",
	"callback",
	"preserve"
], ({ inner }, isInner) => inner.toString(isInner));
//#endregion
//#region lib/types/shared/core.js
/** Built-in policies; Manual keeps the individual controls authoritative. */
const RECOVERY_PRESETS = {
	safe: {
		restartResumeWindowMs: 300 * 1e3,
		graceMs: 5e3,
		cooldownMs: 30 * 1e3,
		maxConsecutive: 2,
		scanLimit: 4,
		freshMs: 600 * 1e3,
		backoffFactor: 2,
		backoffMaxMs: 600 * 1e3
	},
	balanced: {
		restartResumeWindowMs: 600 * 1e3,
		graceMs: 3e3,
		cooldownMs: 20 * 1e3,
		maxConsecutive: 3,
		scanLimit: 8,
		freshMs: 900 * 1e3,
		backoffFactor: 2,
		backoffMaxMs: 300 * 1e3
	},
	"long-task": {
		restartResumeWindowMs: 1800 * 1e3,
		graceMs: 5e3,
		cooldownMs: 60 * 1e3,
		maxConsecutive: 8,
		scanLimit: 16,
		freshMs: 3600 * 1e3,
		backoffFactor: 2,
		backoffMaxMs: 900 * 1e3
	}
};
/** Locale-owned defaults for the user-editable text fields. */
const LOCALIZED_TEXT_DEFAULTS = {
	zh: {
		continueText: "继续",
		continueTextMaxTokens: "继续",
		guardPendingText: "(上一步工具「{tool}」可能未完成, 先确认状态再继续, 不要重复执行)",
		guardDoneText: "(上一步工具「{tool}」已完成, 结果: {result}; 不要重复执行, 直接继续)",
		loopText: "(检测到你可能陷入循环, 请停止重复刚才的动作, 换一种方式继续)"
	},
	en: {
		continueText: "Continue",
		continueTextMaxTokens: "Continue",
		guardPendingText: "(The previous tool \"{tool}\" may not have completed. Check its state before continuing and do not run it again.)",
		guardDoneText: "(The previous tool \"{tool}\" completed successfully. Result: {result}; do not run it again. Continue from there.)",
		loopText: "(You may be stuck in a loop. Stop repeating the last action and continue with a different approach.)"
	}
};
/** Effective built-in defaults; localized text fields use Chinese until a browser locale is mirrored. */
const DEFAULT_CONFIG = {
	recoveryPreset: "manual",
	enabled: true,
	restartAutoContinue: true,
	restartResumeWindowMs: 600 * 1e3,
	locale: "zh",
	...LOCALIZED_TEXT_DEFAULTS.zh,
	guardTools: true,
	graceMs: 3e3,
	cooldownMs: 2e4,
	maxConsecutive: 3,
	scanOnBoot: true,
	scanLimit: 8,
	freshMs: 900 * 1e3,
	verbose: true,
	classify: true,
	retryableErrorPatterns: "",
	backoffFactor: 2,
	backoffMaxMs: 3e5,
	notify: false,
	paused: false,
	loopGuard: true,
	loopShortChars: 40,
	loopWindowMs: 3e4,
	loopShortCount: 12,
	loopRepeatText: 4,
	loopToolRepeat: 5
};
function numberOr(value, fallback) {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}
function booleanOr(value, fallback) {
	return typeof value === "boolean" ? value : fallback;
}
/** Resolve a (possibly partial / not-yet-loaded) settings section to a full config. */
function resolveConfig(section) {
	const value = section ?? {};
	const recoveryPreset = value.recoveryPreset === "safe" || value.recoveryPreset === "balanced" || value.recoveryPreset === "long-task" || value.recoveryPreset === "manual" ? value.recoveryPreset : DEFAULT_CONFIG.recoveryPreset;
	const preset = recoveryPreset === "manual" ? void 0 : RECOVERY_PRESETS[recoveryPreset];
	const recoveryNumber = (field, fallback) => preset?.[field] ?? numberOr(value[field], fallback);
	const locale = value.locale === "en" ? "en" : "zh";
	const localized = LOCALIZED_TEXT_DEFAULTS[locale];
	const text = typeof value.continueText === "string" && value.continueText.trim() !== "" ? value.continueText : localized.continueText;
	const maxTokensText = typeof value.continueTextMaxTokens === "string" && value.continueTextMaxTokens.trim() !== "" ? value.continueTextMaxTokens : localized.continueTextMaxTokens;
	const guardPendingText = typeof value.guardPendingText === "string" && value.guardPendingText.trim() !== "" ? value.guardPendingText : localized.guardPendingText;
	const guardDoneText = typeof value.guardDoneText === "string" && value.guardDoneText.trim() !== "" ? value.guardDoneText : localized.guardDoneText;
	return {
		recoveryPreset,
		enabled: booleanOr(value.enabled, DEFAULT_CONFIG.enabled),
		restartAutoContinue: booleanOr(value.restartAutoContinue, DEFAULT_CONFIG.restartAutoContinue),
		restartResumeWindowMs: recoveryNumber("restartResumeWindowMs", DEFAULT_CONFIG.restartResumeWindowMs),
		locale,
		continueText: text,
		continueTextMaxTokens: maxTokensText,
		guardTools: booleanOr(value.guardTools, DEFAULT_CONFIG.guardTools),
		guardPendingText,
		guardDoneText,
		graceMs: recoveryNumber("graceMs", DEFAULT_CONFIG.graceMs),
		cooldownMs: recoveryNumber("cooldownMs", DEFAULT_CONFIG.cooldownMs),
		maxConsecutive: Math.max(1, recoveryNumber("maxConsecutive", DEFAULT_CONFIG.maxConsecutive)),
		scanOnBoot: booleanOr(value.scanOnBoot, DEFAULT_CONFIG.scanOnBoot),
		scanLimit: Math.max(1, recoveryNumber("scanLimit", DEFAULT_CONFIG.scanLimit)),
		freshMs: recoveryNumber("freshMs", DEFAULT_CONFIG.freshMs),
		verbose: booleanOr(value.verbose, DEFAULT_CONFIG.verbose),
		classify: booleanOr(value.classify, DEFAULT_CONFIG.classify),
		retryableErrorPatterns: typeof value.retryableErrorPatterns === "string" ? value.retryableErrorPatterns.trim() : DEFAULT_CONFIG.retryableErrorPatterns,
		backoffFactor: Math.max(1, recoveryNumber("backoffFactor", DEFAULT_CONFIG.backoffFactor)),
		backoffMaxMs: recoveryNumber("backoffMaxMs", DEFAULT_CONFIG.backoffMaxMs),
		notify: booleanOr(value.notify, DEFAULT_CONFIG.notify),
		paused: booleanOr(value.paused, DEFAULT_CONFIG.paused),
		loopGuard: booleanOr(value.loopGuard, DEFAULT_CONFIG.loopGuard),
		loopShortChars: Math.max(1, numberOr(value.loopShortChars, DEFAULT_CONFIG.loopShortChars)),
		loopWindowMs: Math.max(1e3, numberOr(value.loopWindowMs, DEFAULT_CONFIG.loopWindowMs)),
		loopShortCount: Math.max(2, numberOr(value.loopShortCount, DEFAULT_CONFIG.loopShortCount)),
		loopRepeatText: Math.max(2, numberOr(value.loopRepeatText, DEFAULT_CONFIG.loopRepeatText)),
		loopToolRepeat: Math.max(2, numberOr(value.loopToolRepeat, DEFAULT_CONFIG.loopToolRepeat)),
		loopText: typeof value.loopText === "string" && value.loopText.trim() !== "" ? value.loopText : localized.loopText
	};
}
function isNonHumanReason(kind) {
	return kind === "error" || kind === "interrupted" || kind === "max-tokens";
}
/**
* 错误分类: 该失败是否值得自动继续。
* 用户填写的 provider 专属文本片段优先覆盖内置结果; 未命中时,
* 永久性失败(认证/余额/模型不存在/上下文超限等)重试也不会成功, 应跳过并通知用户;
* 其余(网络、超时、5xx、429 等)视为临时性失败, 允许自动恢复。
*/
function isTransientFailure(failure, retryableErrorPatterns = "") {
	const haystack = `${failure.code} ${failure.status ?? ""} ${failure.message}`.toLowerCase();
	if (retryableErrorPatterns.split(/\r?\n/).map((pattern) => pattern.trim().toLowerCase()).filter((pattern) => pattern !== "").some((pattern) => haystack.includes(pattern))) return true;
	const status = failure.status;
	if (status !== void 0 && (status === 401 || status === 403)) return false;
	return !(/auth|unauthor|forbidden|credential|api[_-]?key|permission/i.test(haystack) || /insufficient.*(balance|quota)|billing|payment|quota.*exceeded.*(?!retry)/i.test(haystack) || /model.*not[_-]?found|unknown[_-]?model|model[_-]?not[_-]?found|not.*support.*model/i.test(haystack) || /context.*(length|limit|overflow|exceed)|token.*limit|max.*context/i.test(haystack) || /invalid[_-]?request|bad[_-]?request/i.test(haystack));
}
/** 浏览器通知(不可用时静默跳过); 点击通知聚焦窗口, 操作按钮走 onAction。 */
/** 把毫秒格式化为人类可读的经过时长(如 65s → 1m5s)。 */
function formatElapsed(ms) {
	if (ms === void 0 || !Number.isFinite(ms) || ms < 0) return "";
	if (ms < 1e3) return `${Math.round(ms)}ms`;
	const s = Math.round(ms / 1e3);
	if (s < 60) return `${s}s`;
	return `${Math.floor(s / 60)}m${s % 60 > 0 ? `${s % 60}s` : ""}`;
}
/** 用失败事实与回合信息填充 continueText 模板占位符({code}/{message}/{status}/{tool}/{turn}/{errorCount}/{sessionTitle}/{elapsed}/{result})。 */
function fillTemplate(template, ctx) {
	return template.replace(/\{code\}/g, ctx.facts?.code ?? "").replace(/\{message\}/g, ctx.facts?.message ?? "").replace(/\{status\}/g, ctx.facts?.status !== void 0 ? String(ctx.facts.status) : "").replace(/\{tool\}/g, ctx.tool ?? "").replace(/\{turn\}/g, ctx.turn !== void 0 ? String(ctx.turn) : "").replace(/\{errorCount\}/g, ctx.errorCount !== void 0 ? String(ctx.errorCount) : "").replace(/\{sessionTitle\}/g, ctx.sessionTitle ?? "").replace(/\{elapsed\}/g, formatElapsed(ctx.elapsedMs)).replace(/\{result\}/g, ctx.result ?? "");
}
/** 工具结果摘要的最大长度(护栏模板 {result} 用)。 */
const TOOL_RESULT_CAP = 160;
/**
* 给 JSON 值生成定长且键顺序无关的稳定指纹。
*
* 这里不保存可能很大的工具输出原文；每个字符都会进入两个独立的
* 32-bit 累加器，再附上字符数，供 loop guard 比较完整的模型可见结果。
*/
function stableFingerprint(value) {
	let first = 2166136261;
	let second = 2654435769;
	let length = 0;
	const feed = (text) => {
		length += text.length;
		for (let i = 0; i < text.length; i += 1) {
			const code = text.charCodeAt(i);
			first = Math.imul(first ^ code, 16777619) >>> 0;
			second = Math.imul(second ^ code, 2246822507) >>> 0;
			second = (second ^ second >>> 13) >>> 0;
		}
	};
	const walk = (part) => {
		if (part === null) feed("null");
		else if (Array.isArray(part)) {
			feed("[");
			for (const item of part) {
				walk(item);
				feed(",");
			}
			feed("]");
		} else if (typeof part === "object") {
			feed("{");
			const record = part;
			for (const key of Object.keys(record).sort()) {
				feed(JSON.stringify(key));
				feed(":");
				walk(record[key]);
				feed(",");
			}
			feed("}");
		} else feed(`${typeof part}:${JSON.stringify(part) ?? String(part)}`);
	};
	walk(value);
	return `${first.toString(16).padStart(8, "0")}${second.toString(16).padStart(8, "0")}:${length}`;
}
/** 从任意内容块里递归收集文本(结果为模型可见的工具输出)。 */
function extractText(blocks, cap) {
	let out = "";
	const walk = (value) => {
		if (out.length >= cap) return;
		if (Array.isArray(value)) {
			for (const item of value) walk(item);
			return;
		}
		if (typeof value !== "object" || value === null) return;
		const record = value;
		if (record["type"] === "text" && typeof record["text"] === "string") {
			out += record["text"];
			return;
		}
		for (const child of Object.values(record)) walk(child);
	};
	walk(blocks);
	return out.slice(0, cap);
}
function toolCorrelationKey(data, callId) {
	if (callId === void 0 || typeof data.turn !== "number" || typeof data.step !== "number") return;
	return JSON.stringify([
		data.turn,
		data.step,
		callId
	]);
}
function resultBlock(data) {
	return data.message?.content?.find((part) => part.type === "tool-result");
}
/**
* 取工具结果的关联 id。新版 DSH 的权威位置是 message.source.callId，
* 同时接受模型可见 block 上的 toolCallId；两者冲突时宁可忽略，不猜测配对。
*/
function toolResultCallId(data) {
	if (resultBlock(data) === void 0) return void 0;
	const sourceId = data.message?.source?.kind === "tool" ? data.message.source.callId : void 0;
	const blockId = resultBlock(data)?.toolCallId;
	const source = typeof sourceId === "string" && sourceId !== "" ? sourceId : void 0;
	const block = typeof blockId === "string" && blockId !== "" ? blockId : void 0;
	if (source !== void 0 && block !== void 0 && source !== block) return void 0;
	return source ?? block;
}
/** 从 tool/result 事件载荷提取成功与否与文本摘要。 */
function toolResultFacts(data) {
	const result = resultBlock(data);
	const failed = data.error !== void 0 || result?.isError === true;
	return {
		ok: !failed,
		excerpt: extractText(result?.content, TOOL_RESULT_CAP),
		identity: stableFingerprint({
			content: result?.content ?? [],
			isError: failed
		})
	};
}
const MAX_PENDING_TOOL_CALLS = 64;
const MAX_SEEN_TOOL_CALL_IDS = 256;
/**
* 每个会话的工具调用关联器。
*
* 集中封装事件关联、step 边界确认、护栏读取与重置。内部按 callId 配对，
* 乱序结果先缓存、再按调用顺序推进 loop 计数。队列和去重 id 都有硬上限；
* 超限或载荷无法关联时会打断重复计数，宁可漏报也不误杀健康回合。
*/
var ToolInvocationTracker = class {
	pendingById = /* @__PURE__ */ new Map();
	pendingInOrder = [];
	seenCalls = /* @__PURE__ */ new Map();
	seenInOrder = [];
	latest;
	run;
	repeatSignal;
	lastEventSeq = -1;
	reset() {
		this.pendingById.clear();
		this.pendingInOrder.length = 0;
		this.seenCalls.clear();
		this.seenInOrder.length = 0;
		this.latest = void 0;
		this.run = void 0;
		this.repeatSignal = void 0;
		this.lastEventSeq = -1;
	}
	/** 新回合边界：清空工具态，同时把重放水位推进到 turn/start。 */
	startTurn(seq) {
		if (!Number.isSafeInteger(seq) || seq < 0 || seq <= this.lastEventSeq) return;
		this.reset();
		this.lastEventSeq = seq;
	}
	/** 回合已结束：保留最后一次调用的护栏，丢弃不再可用的 loop 关联态。 */
	resetRepeat() {
		this.pendingById.clear();
		this.pendingInOrder.length = 0;
		this.seenCalls.clear();
		this.seenInOrder.length = 0;
		this.run = void 0;
		this.repeatSignal = void 0;
	}
	recordCall(event) {
		if (!this.acceptEventSeq(event.seq)) return false;
		this.repeatSignal = void 0;
		const data = event.data;
		if (typeof data.name !== "string") {
			this.breakCorrelation();
			return true;
		}
		const key = `${data.name}\n${typeof data.arguments === "string" ? data.arguments : ""}`;
		const id = toolCorrelationKey(data, typeof data.callId === "string" && data.callId !== "" ? data.callId : void 0);
		if (id === void 0) {
			this.breakCorrelation({
				id: void 0,
				name: data.name,
				key,
				result: void 0,
				resultSeq: void 0
			});
			return true;
		}
		if (this.seenCalls.get(id) !== void 0) {
			this.breakCorrelation({
				id: void 0,
				name: data.name,
				key,
				result: void 0,
				resultSeq: void 0
			});
			return true;
		}
		const call = {
			id,
			name: data.name,
			key,
			result: void 0,
			resultSeq: void 0
		};
		this.latest = call;
		this.pendingById.set(id, call);
		this.pendingInOrder.push(call);
		this.seenCalls.set(id, call);
		this.seenInOrder.push(id);
		this.trim(call);
		return true;
	}
	recordResult(event) {
		if (!this.acceptEventSeq(event.seq)) return void 0;
		const data = event.data;
		const id = toolCorrelationKey(data, toolResultCallId(data));
		if (id === void 0) {
			this.breakCorrelation(this.latest);
			return;
		}
		const surfaceOp = event.surfaceOp;
		if (typeof surfaceOp === "object" && surfaceOp !== null) {
			const call = this.seenCalls.get(id);
			if (surfaceOp.startSeq !== surfaceOp.endSeq || call === void 0 || call.result === void 0 || call.resultSeq !== surfaceOp.startSeq) {
				this.breakCorrelation(this.latest);
				return;
			}
			call.result = toolResultFacts(data);
			call.resultSeq = event.seq;
			this.breakCorrelation(this.latest);
			return;
		}
		const call = this.pendingById.get(id);
		if (call === void 0) {
			const seen = this.seenCalls.get(id);
			const duplicate = seen?.result;
			const incoming = toolResultFacts(data);
			if (seen !== void 0 && duplicate !== void 0 && seen.resultSeq === event.seq && duplicate.identity === incoming.identity) return;
			if (seen !== void 0 && duplicate !== void 0) {
				seen.result = void 0;
				seen.resultSeq = void 0;
			}
			this.breakCorrelation(this.latest);
			return;
		}
		if (call.result !== void 0) {
			const incoming = toolResultFacts(data);
			if (call.resultSeq === event.seq && call.result.identity === incoming.identity) return;
			call.result = void 0;
			call.resultSeq = void 0;
			this.breakCorrelation(this.latest);
			return;
		}
		call.result = toolResultFacts(data);
		call.resultSeq = event.seq;
		return this.drainCompleted();
	}
	guard() {
		const latest = this.latest;
		if (latest === void 0) return { kind: "none" };
		if (latest.result === void 0) return {
			kind: "pending",
			tool: latest.name
		};
		if (latest.result.ok) return {
			kind: "done",
			tool: latest.name,
			result: latest.result.excerpt
		};
		return {
			kind: "failed",
			tool: latest.name
		};
	}
	lastTool() {
		return this.latest?.name;
	}
	/** 下一模型 step 是稳定边界；此前 replacement/新调用会先清除候选。 */
	confirmRepeatAtStep(seq) {
		if (!this.acceptEventSeq(seq)) return void 0;
		const signal = this.pendingInOrder.length === 0 ? this.repeatSignal : void 0;
		this.repeatSignal = void 0;
		return signal;
	}
	/** 非工具 surface range replacement（如 compaction summary）同样终止旧工具证据。 */
	recordSurfaceReplacement(seq) {
		if (!this.acceptEventSeq(seq)) return;
		this.breakCorrelation(this.latest);
	}
	restore(events, untilSeq) {
		this.reset();
		for (const event of events) {
			if (event.seq >= untilSeq) continue;
			if (event.type === "turn/start") this.startTurn(event.seq);
			else if (event.type === "step/start") this.confirmRepeatAtStep(event.seq);
			else if (event.type === "tool/call") this.recordCall(event);
			else if (event.type === "tool/result") this.recordResult(event);
			else if ((event.type === "user/message" || event.type === "assistant/message") && typeof event.surfaceOp === "object" && event.surfaceOp !== null) this.recordSurfaceReplacement(event.seq);
		}
	}
	acceptEventSeq(seq) {
		if (!Number.isSafeInteger(seq) || seq < 0) {
			this.breakCorrelation(this.latest);
			return false;
		}
		if (seq <= this.lastEventSeq) return false;
		this.lastEventSeq = seq;
		return true;
	}
	breakCorrelation(latest, preserve) {
		this.pendingById.clear();
		this.pendingInOrder.length = 0;
		this.invalidateRunHistory();
		this.latest = latest;
		if (preserve?.id !== void 0 && preserve.result === void 0 && this.seenCalls.get(preserve.id) === preserve) {
			this.pendingById.set(preserve.id, preserve);
			this.pendingInOrder.push(preserve);
		}
	}
	invalidateRunHistory() {
		this.run = void 0;
		this.repeatSignal = void 0;
	}
	trim(current) {
		while (this.pendingInOrder.length > MAX_PENDING_TOOL_CALLS) this.breakCorrelation(current, current);
		while (this.seenInOrder.length > MAX_SEEN_TOOL_CALL_IDS) {
			const id = this.seenInOrder.shift();
			if (id !== void 0) {
				this.seenCalls.delete(id);
				this.breakCorrelation(current, current);
			}
		}
	}
	drainCompleted() {
		let advanced = false;
		while (this.pendingInOrder[0]?.result !== void 0) {
			const call = this.pendingInOrder.shift();
			if (call === void 0 || call.result === void 0) break;
			advanced = true;
			if (call.id !== void 0) this.pendingById.delete(call.id);
			this.advanceRun(call);
		}
		if (!advanced) return void 0;
		return this.refreshRepeatSignal();
	}
	advanceRun(call) {
		if (call.result === void 0) return;
		if (this.run?.key === call.key && this.run.identity === call.result.identity) this.run.count += 1;
		else this.run = {
			key: call.key,
			tool: call.name,
			identity: call.result.identity,
			count: 1
		};
	}
	refreshRepeatSignal() {
		this.repeatSignal = this.pendingInOrder.length === 0 && this.run !== void 0 ? {
			tool: this.run.tool,
			count: this.run.count
		} : void 0;
		return this.repeatSignal;
	}
};
/** 自适应退避: 同一会话连续失败时的有效冷却间隔。 */
function effectiveCooldown(consecutive, base, factor, max) {
	return Math.min(Math.max(base, base * Math.pow(factor, consecutive)), Math.max(base, max));
}
function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
function todayKey() {
	const d = /* @__PURE__ */ new Date();
	const mm = String(d.getMonth() + 1).padStart(2, "0");
	const dd = String(d.getDate()).padStart(2, "0");
	return `${d.getFullYear()}-${mm}-${dd}`;
}
/** 空统计桶。 */
function emptyDayStats() {
	return {
		date: todayKey(),
		sent: 0,
		skipped: 0,
		recovered: 0,
		failed: 0,
		gaveUp: 0,
		looped: 0,
		byCode: {}
	};
}
const freshState = () => ({
	consecutive: 0,
	lastAttemptAt: 0,
	pendingEchoMessageIds: /* @__PURE__ */ new Map(),
	pendingTimer: void 0,
	running: void 0,
	queued: 0,
	subagent: false,
	lastFailure: void 0,
	lastFailureAt: 0,
	tools: new ToolInvocationTracker(),
	lastTurn: void 0,
	pendingRecoveryAt: 0,
	shortRun: 0,
	lastShortAt: 0,
	lastAssistantText: "",
	sameTextRun: 0,
	streamTail: "",
	streamLastSegment: "",
	streamRepeatRun: 0,
	loopFired: false,
	loopRetryTimer: void 0
});
const MAX_PENDING_ECHO_MESSAGE_IDS = 64;
function prunePendingEchoMessageIds(state, now) {
	for (const [messageId, queuedAt] of state.pendingEchoMessageIds) if (now - queuedAt > 6e5) state.pendingEchoMessageIds.delete(messageId);
}
/** Track an identified plugin message before handing it to the host queue. */
function trackPendingEcho(state, messageId) {
	const now = Date.now();
	prunePendingEchoMessageIds(state, now);
	state.pendingEchoMessageIds.set(messageId, now);
	while (state.pendingEchoMessageIds.size > MAX_PENDING_ECHO_MESSAGE_IDS) {
		const oldest = state.pendingEchoMessageIds.keys().next();
		if (oldest.done) break;
		state.pendingEchoMessageIds.delete(oldest.value);
	}
}
/** Roll back tracking when the host rejects a queued message. */
function forgetPendingEcho(state, messageId) {
	state.pendingEchoMessageIds.delete(messageId);
}
/** Match and consume one plugin-owned `user/message` event by stable message ID. */
function isOurEcho(state, event) {
	if (event.type !== "user/message") return false;
	const message = event.data;
	if (message.source.kind !== "user") return false;
	if (state.pendingEchoMessageIds.size === 0) return false;
	prunePendingEchoMessageIds(state, Date.now());
	return state.pendingEchoMessageIds.delete(message.id);
}
//#endregion
//#region lib/types/host/engine.js
/**
* Auto-continue engine — host half core (single instance).
*
* Runs inside the dsh host process, so there is exactly ONE engine regardless
* of how many browser tabs are open — the multi-tab duplicate-send class of
* bugs (issue #13) cannot exist by construction. Listens to the session event
* firehose (`session/event`), sends through the agent registry
* (`agent.followup`), cancels through `agent.cancel`, and reads configuration
* from the settings service.
*
* All behavior is driven by the `auto-continue` settings namespace (see the
* plugin's settings card); every knob below is user-configurable there.
*/
const PLUGIN_NAME$1 = "dsh-session-resilience";
const NOTICE_COPY = {
	zh: {
		notContinuedTitle: "dsh-session-resilience: 未自动继续",
		permanentErrorBody: (sessionId, summary) => `${sessionId}: 永久性错误 ${summary}，需要人工处理`,
		resumeAction: "立即续跑",
		pauseAction: "暂停该会话 1 小时",
		continuedTitle: "dsh-session-resilience: 已自动继续",
		continuedBody: (sessionId, text, count) => `${sessionId}: 已发送「${text}」(第 ${count} 次连续)`,
		stoppedTitle: "dsh-session-resilience: 已停止自动继续",
		stoppedBody: (sessionId, count) => `${sessionId}: 连续失败 ${count} 次, 需要人工介入`
	},
	en: {
		notContinuedTitle: "dsh-session-resilience: Not continued",
		permanentErrorBody: (sessionId, summary) => `${sessionId}: Permanent error ${summary}; manual intervention required`,
		resumeAction: "Resume now",
		pauseAction: "Pause this session for 1 hour",
		continuedTitle: "dsh-session-resilience: Continued automatically",
		continuedBody: (sessionId, text, count) => `${sessionId}: Sent "${text}" (consecutive attempt ${count})`,
		stoppedTitle: "dsh-session-resilience: Auto-continue stopped",
		stoppedBody: (sessionId, count) => `${sessionId}: ${count} consecutive failures; manual intervention required`
	}
};
/** Durable cancel identity reserved for this plugin's loop guard. */
const LOOP_GUARD_CANCEL_CAUSE = {
	kind: "hook",
	reason: "dsh-session-resilience:loop-guard"
};
/** Keep fuzzy matching off the unbounded host event path; exact repeats remain unlimited. */
const STREAM_NEAR_DUPLICATE_MAX_CHARS = 2048;
/** Read one stable event-log snapshot on both legacy and DSH 0.1.2 hosts. */
function snapshotSessionEvents(session) {
	const compatible = session;
	if (typeof compatible.snapshotEvents === "function") return compatible.snapshotEvents();
	if (compatible.events !== void 0) return compatible.events;
	throw new TypeError("session exposes neither snapshotEvents() nor events");
}
/** Interpret host failure payloads without trusting persisted or plugin-provided event shapes. */
function parseFailureFacts(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return void 0;
	const failure = value;
	const code = typeof failure.code === "string" && failure.code.trim() !== "" ? failure.code : void 0;
	const message = typeof failure.message === "string" && failure.message.trim() !== "" ? failure.message : void 0;
	const status = typeof failure.status === "number" && Number.isFinite(failure.status) ? failure.status : void 0;
	if (code === void 0 && message === void 0 && status === void 0) return void 0;
	return {
		code: code ?? "UNKNOWN",
		message: message ?? code ?? `HTTP ${status}`,
		...status !== void 0 ? { status } : {}
	};
}
/** Read a reason discriminator defensively because session history can outlive its schema. */
function readReasonKind(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return void 0;
	const kind = value.kind;
	return typeof kind === "string" && kind.trim() !== "" ? kind : void 0;
}
function isLoopGuardCancelReason(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
	const cause = value;
	return cause.kind === LOOP_GUARD_CANCEL_CAUSE.kind && cause.reason === LOOP_GUARD_CANCEL_CAUSE.reason;
}
/** 插件主体: 一条 mux 流 + 一条 host 流 + 启动/重连扫描。 */
var AutoContinueRunner = class {
	ctx;
	getConfig;
	states = /* @__PURE__ */ new Map();
	pauseUntil = /* @__PURE__ */ new Map();
	dayStats = emptyDayStats();
	notices = [];
	noticeListeners = /* @__PURE__ */ new Set();
	stateListeners = /* @__PURE__ */ new Set();
	disposeSessionEvents;
	disposed = false;
	/**
	* @param ctx - host plugin context (agents registry, session events, settings).
	* @param getConfig - read the current resolved configuration (settings service).
	*/
	constructor(ctx, getConfig) {
		this.ctx = ctx;
		this.getConfig = getConfig;
		this.disposeSessionEvents = ctx.on("session/event", (session, event) => {
			try {
				this.onHostEvent(session, event);
			} catch (error) {
				console.error(`[dsh-session-resilience] 会话事件处理异常 ${session.id}: ${error instanceof Error ? error.message : String(error)}`);
			}
		});
		const config = this.getConfig();
		if (config.scanOnBoot) this.bootScanLoop();
		this.log(`已启动(host 单实例, 文本="${config.continueText}", 宽限 ${config.graceMs}ms, 冷却 ${config.cooldownMs}ms, 最多连续 ${config.maxConsecutive} 次)`);
	}
	log(message) {
		if (this.getConfig().verbose) console.info(`[dsh-session-resilience] ${message}`);
	}
	/** 对外(状态桥): 今日统计快照。 */
	todayStats() {
		const today = todayKey();
		if (this.dayStats.date !== today) this.dayStats = emptyDayStats();
		return {
			...this.dayStats,
			byCode: { ...this.dayStats.byCode }
		};
	}
	/** 对外(状态桥): 当前生效的会话级暂停列表。 */
	activePauses() {
		const now = Date.now();
		const out = [];
		for (const [sessionId, until] of this.pauseUntil) if (until > now) out.push({
			sessionId,
			until
		});
		return out;
	}
	/** 对外(状态桥): 订阅通知事件(SSE 端点推送)。 */
	subscribeNotices(listener) {
		this.noticeListeners.add(listener);
		return () => {
			this.noticeListeners.delete(listener);
		};
	}
	/** 对外(状态桥): 订阅运行时状态变化(统计/暂停列表)。 */
	subscribeState(listener) {
		this.stateListeners.add(listener);
		return () => {
			this.stateListeners.delete(listener);
		};
	}
	emitState() {
		for (const listener of this.stateListeners) listener();
	}
	/** 对外(状态桥): 消费待展示的通知。 */
	drainNotices() {
		return this.notices.splice(0, this.notices.length);
	}
	/** 通知动作(browser 通知按钮回传): 立即续跑 / 暂停该会话 / 解除暂停 / 清零统计。 */
	handleNoticeAction(sessionId, action) {
		if (action === "unpause") {
			if (sessionId !== void 0) this.pauseUntil.delete(sessionId);
			this.log(`解除暂停 ${sessionId ?? "?"}`);
		} else if (action === "reset-stats") {
			this.dayStats = emptyDayStats();
			this.log("清零今日统计");
		} else if (sessionId !== void 0) this.onNotifyAction(sessionId, action);
		this.emitState();
	}
	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		this.disposeSessionEvents();
		for (const state of this.states.values()) {
			if (state.pendingTimer !== void 0) clearTimeout(state.pendingTimer);
			if (state.loopRetryTimer !== void 0) clearTimeout(state.loopRetryTimer);
		}
		this.states.clear();
	}
	state(sessionId) {
		let state = this.states.get(sessionId);
		if (state === void 0) {
			state = freshState();
			this.states.set(sessionId, state);
		}
		return state;
	}
	/**
	* 事件入口(host 单实例): 预处理工具调用/结果/模型消息(护栏与循环信号),
	* 然后交给回合状态机。
	*/
	onHostEvent(session, event) {
		const sessionId = session.id;
		if ((event.type === "user/message" || event.type === "assistant/message") && typeof event.surfaceOp === "object" && event.surfaceOp !== null) {
			this.state(sessionId).tools.recordSurfaceReplacement(event.seq);
			return;
		}
		if (event.type === "tool/call") {
			const state = this.state(sessionId);
			if (state.tools.recordCall(event)) state.shortRun = 0;
		} else if (event.type === "tool/result") this.state(sessionId).tools.recordResult(event);
		else if (event.type === "step/start") {
			const state = this.state(sessionId);
			const repeat = state.tools.confirmRepeatAtStep(event.seq);
			if (repeat !== void 0) this.checkLoop(sessionId, state, repeat);
		} else if (event.type === "assistant/message") {
			const state = this.state(sessionId);
			this.onAssistantMessage(sessionId, state, event);
		}
		this.onSessionEvent(sessionId, event);
	}
	/** 从 assistant/message 事件提取纯文本。 */
	assistantText(event) {
		const content = event.data.message.content;
		if (!Array.isArray(content)) return "";
		return content.filter((part) => part.type === "text").map((part) => part.text).join("");
	}
	normalizedSegment(text) {
		return text.replace(/\s+/g, " ").trim();
	}
	isNearDuplicateSegment(left, right) {
		if (left === right) return true;
		const leftLen = left.length;
		const rightLen = right.length;
		const longer = Math.max(leftLen, rightLen);
		const shorter = Math.min(leftLen, rightLen);
		if (shorter === 0 || shorter / longer < .85) return false;
		if (longer > STREAM_NEAR_DUPLICATE_MAX_CHARS) return false;
		const maxDistance = Math.max(6, Math.floor(longer * .08));
		if (Math.abs(leftLen - rightLen) > maxDistance) return false;
		return this.withinEditDistance(left, right, maxDistance);
	}
	withinEditDistance(left, right, maxDistance) {
		if (left === right) return true;
		if (maxDistance < 0) return false;
		const leftLen = left.length;
		const rightLen = right.length;
		if (Math.abs(leftLen - rightLen) > maxDistance) return false;
		if (leftLen === 0 || rightLen === 0) return Math.max(leftLen, rightLen) <= maxDistance;
		const unreachable = maxDistance + 1;
		let previous = new Int32Array(rightLen + 1);
		let current = new Int32Array(rightLen + 1);
		previous.fill(unreachable);
		for (let col = 0; col <= Math.min(rightLen, maxDistance); col += 1) previous[col] = col;
		for (let row = 1; row <= leftLen; row += 1) {
			current.fill(unreachable);
			if (row <= maxDistance) current[0] = row;
			const firstCol = Math.max(1, row - maxDistance);
			const lastCol = Math.min(rightLen, row + maxDistance);
			let minInRow = unreachable;
			for (let col = firstCol; col <= lastCol; col += 1) {
				const insertion = (current[col - 1] ?? unreachable) + 1;
				const deletion = (previous[col] ?? unreachable) + 1;
				const substitution = (previous[col - 1] ?? unreachable) + (left.charCodeAt(row - 1) === right.charCodeAt(col - 1) ? 0 : 1);
				const score = Math.min(insertion, deletion, substitution, unreachable);
				current[col] = score;
				if (score < minInRow) minInRow = score;
			}
			if (minInRow > maxDistance) return false;
			[previous, current] = [current, previous];
		}
		return (previous[rightLen] ?? unreachable) <= maxDistance;
	}
	noteStreamSegment(sessionId, state, segment) {
		const normalized = this.normalizedSegment(segment);
		const config = this.getConfig();
		if (normalized === "") return;
		if (normalized.length < config.loopShortChars) {
			state.streamLastSegment = "";
			state.streamRepeatRun = 0;
			return;
		}
		if (state.streamLastSegment !== "" && this.isNearDuplicateSegment(normalized, state.streamLastSegment)) {
			state.streamRepeatRun += 1;
			state.streamLastSegment = normalized;
		} else {
			state.streamLastSegment = normalized;
			state.streamRepeatRun = 1;
		}
		if (state.streamRepeatRun >= config.loopRepeatText) {
			this.log(`检测到流式消息内复读 ${sessionId}: 连续 ${state.streamRepeatRun} 段近似重复文本`);
			this.interruptLoop(sessionId, state);
		}
	}
	onAssistantMessage(sessionId, state, event) {
		if (!this.getConfig().loopGuard) return;
		const trimmed = this.assistantText(event).trim();
		if (trimmed !== "" && trimmed === state.lastAssistantText) state.sameTextRun += 1;
		else {
			state.lastAssistantText = trimmed;
			state.sameTextRun = 1;
		}
		if (trimmed.length < this.getConfig().loopShortChars) {
			const now = Date.now();
			if (now - state.lastShortAt > this.getConfig().loopWindowMs) state.shortRun = 0;
			state.shortRun += 1;
			state.lastShortAt = now;
		} else {
			state.shortRun = 0;
			state.lastShortAt = 0;
		}
		const streamTail = state.streamTail;
		state.streamTail = "";
		if (streamTail !== "") this.noteStreamSegment(sessionId, state, streamTail);
		state.streamLastSegment = "";
		state.streamRepeatRun = 0;
		this.checkLoop(sessionId, state);
	}
	/** 两个循环信号的公共检查; 命中且本回合未打断过则打断。 */
	checkLoop(sessionId, state, toolRepeat) {
		if (!this.getConfig().loopGuard) return;
		if (state.loopFired) return;
		if (!state.running) return;
		const config = this.getConfig();
		if (state.sameTextRun >= config.loopRepeatText) {
			this.log(`检测到空转循环 ${sessionId}: 连续 ${state.sameTextRun} 条相同消息`);
			this.interruptLoop(sessionId, state);
		} else if (state.shortRun >= config.loopShortCount) {
			this.log(`检测到空转循环 ${sessionId}: 连续 ${state.shortRun} 条短句且无工具调用`);
			this.interruptLoop(sessionId, state);
		} else if (toolRepeat !== void 0 && toolRepeat.count >= config.loopToolRepeat) {
			this.log(`检测到工具死循环 ${sessionId}: 「${toolRepeat.tool}」连续 ${toolRepeat.count} 次(同参数同结果)`);
			this.interruptLoop(sessionId, state);
		}
	}
	/**
	* 打断运行中的回合: cancel(带来源标记)+ 进冷却。
	* 只有随后持久化的 turn/end 精确携带专属 hook cause 时,
	* 才会用 loopText 重启回合——DSH 的 first-cause 语义保证用户 Stop 优先。
	*/
	interruptLoop(sessionId, state) {
		if (state.loopFired) return;
		if (Date.now() - state.lastAttemptAt < this.cooldownFor(state)) {
			this.log(`跳过循环打断 ${sessionId}: 处于冷却期`);
			return;
		}
		state.loopFired = true;
		state.lastAttemptAt = Date.now();
		try {
			const agent = this.ctx.agents.get(sessionId);
			if (agent === void 0) {
				this.log(`打断循环失败 ${sessionId}: 无 live agent`);
				state.loopFired = false;
				return;
			}
			agent.cancel(LOOP_GUARD_CANCEL_CAUSE, { keepInbox: true });
			this.log(`已打断循环 ${sessionId}: cancel 已受理`);
		} catch (error) {
			this.log(`打断循环失败 ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
			state.loopFired = false;
		}
	}
	onSessionEvent(sessionId, event) {
		const state = this.state(sessionId);
		switch (event.type) {
			case "turn/start":
				state.running = true;
				state.tools.startTurn(event.seq);
				state.shortRun = 0;
				state.lastShortAt = 0;
				state.lastAssistantText = "";
				state.sameTextRun = 0;
				state.streamTail = "";
				state.streamLastSegment = "";
				state.streamRepeatRun = 0;
				state.loopFired = false;
				if (state.loopRetryTimer !== void 0) {
					clearTimeout(state.loopRetryTimer);
					state.loopRetryTimer = void 0;
				}
				this.cancelPending(sessionId, "宿主自行开启新回合");
				break;
			case "turn/end": {
				state.running = false;
				const loopCancelPending = state.loopFired;
				state.loopFired = false;
				this.cancelPending(sessionId, "收到新的 turn/end");
				const reason = event.data.reason;
				const reasonKind = readReasonKind(reason);
				if (reasonKind === void 0) {
					console.error(`[dsh-session-resilience] 忽略畸形 turn/end ${sessionId}: reason 无法解释`);
					break;
				}
				if (reasonKind === "completed") {
					state.consecutive = 0;
					state.lastFailure = void 0;
					this.noteRecovery(sessionId, "completed");
				} else if (reasonKind === "aborted") if (isLoopGuardCancelReason(reason.reason)) {
					if (loopCancelPending) this.bumpStat({ looped: 1 });
					state.pendingRecoveryAt = 0;
					state.shortRun = 0;
					state.lastShortAt = 0;
					state.lastAssistantText = "";
					state.sameTextRun = 0;
					state.streamTail = "";
					state.streamLastSegment = "";
					state.streamRepeatRun = 0;
					state.tools.resetRepeat();
					const remaining = this.cooldownFor(state) - (Date.now() - state.lastAttemptAt);
					if (remaining > 0) {
						if (state.loopRetryTimer !== void 0) clearTimeout(state.loopRetryTimer);
						state.loopRetryTimer = setTimeout(() => {
							state.loopRetryTimer = void 0;
							try {
								this.schedule(sessionId, "loop:aborted");
							} catch (error) {
								console.error(`[dsh-session-resilience] loop 重启异常 ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
							}
						}, remaining);
						this.log(`loop 重启延迟 ${remaining}ms(冷却期) ${sessionId}`);
					} else this.schedule(sessionId, "loop:aborted");
				} else {
					state.consecutive = 0;
					state.pendingRecoveryAt = 0;
				}
				else if (reasonKind === "blocked") {} else if (reasonKind === "interrupted") {
					state.consecutive = 0;
					state.pendingRecoveryAt = 0;
				} else if (reasonKind === "error") {
					const failure = parseFailureFacts(reason.error);
					if (failure === void 0) {
						console.error(`[dsh-session-resilience] 忽略畸形 turn/end ${sessionId}: error details 无法解释`);
						break;
					}
					state.lastFailure = failure;
					state.lastTurn = event.data.turn;
					state.lastFailureAt = Date.now();
					this.noteRecovery(sessionId, "error");
					this.onTurnFailure(sessionId, "turn/end:error", state.lastFailure);
				} else if (reasonKind === "max-tokens") {
					state.lastFailureAt = Date.now();
					this.noteRecovery(sessionId, "error");
					this.schedule(sessionId, "turn/end:max-tokens");
				}
				break;
			}
			case "user/message":
				if (isOurEcho(state, event)) break;
				if (event.data.source.kind === "user") {
					state.consecutive = 0;
					this.cancelPending(sessionId, "用户手动发送消息");
				}
				break;
			default: break;
		}
	}
	onTurnFailure(sessionId, reason, failure) {
		const config = this.getConfig();
		if (config.classify && !isTransientFailure(failure, config.retryableErrorPatterns)) {
			const copy = NOTICE_COPY[config.locale];
			const summary = `${failure.code}${failure.status !== void 0 ? ` (HTTP ${failure.status})` : ""}`;
			this.log(`跳过 ${sessionId}(${reason}): 永久性失败 ${summary} — ${failure.message}`);
			this.bumpStat({
				skipped: 1,
				code: failure.code
			});
			if (config.notify) this.notify(sessionId, copy.notContinuedTitle, copy.permanentErrorBody(sessionId, summary), this.notifyOptions(sessionId, config.locale));
			return;
		}
		this.schedule(sessionId, reason);
	}
	/** 通知操作按钮与回调(「立即续跑」/「暂停该会话 1 小时」)。 */
	notifyOptions(sessionId, locale) {
		const copy = NOTICE_COPY[locale];
		return {
			actions: [{
				action: "resume",
				title: copy.resumeAction
			}, {
				action: "pause1h",
				title: copy.pauseAction
			}],
			onAction: (action) => this.onNotifyAction(sessionId, action)
		};
	}
	onNotifyAction(sessionId, action) {
		if (action === "resume") {
			this.log(`通知按钮: 立即续跑 ${sessionId}`);
			this.resumeNow(sessionId);
		} else if (action === "pause1h") {
			this.log(`通知按钮: 暂停 ${sessionId} 1 小时`);
			this.pauseUntil.set(sessionId, Date.now() + 3600 * 1e3);
			this.cancelPending(sessionId, "通知按钮暂停该会话");
		}
	}
	/** 内存统计(host 单实例): 按今日桶累计。 */
	bumpStat(delta) {
		const today = todayKey();
		if (this.dayStats.date !== today) this.dayStats = emptyDayStats();
		if (delta.sent !== void 0) this.dayStats.sent += delta.sent;
		if (delta.skipped !== void 0) this.dayStats.skipped += delta.skipped;
		if (delta.recovered !== void 0) this.dayStats.recovered += delta.recovered;
		if (delta.failed !== void 0) this.dayStats.failed += delta.failed;
		if (delta.gaveUp !== void 0) this.dayStats.gaveUp += delta.gaveUp;
		if (delta.looped !== void 0) this.dayStats.looped += delta.looped;
		if (delta.code !== void 0) this.dayStats.byCode[delta.code] = (this.dayStats.byCode[delta.code] ?? 0) + 1;
	}
	/** 通知桥: 产生一条通知事件, SSE 端点推给 browser 侧展示。 */
	notify(sessionId, title, body, options) {
		const notice = {
			id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
			title,
			body,
			sessionId,
			...options?.actions !== void 0 && options.actions.length > 0 ? { actions: options.actions } : { actions: [] },
			at: Date.now()
		};
		this.notices.push(notice);
		for (const listener of this.noticeListeners) listener();
		this.emitState();
	}
	/** 恢复结果记账: 自动发送后窗口内的回合结束, 判定恢复成功或失败。 */
	noteRecovery(sessionId, outcome) {
		const state = this.state(sessionId);
		if (state.pendingRecoveryAt === 0) return;
		if (Date.now() - state.pendingRecoveryAt > 6e5) {
			state.pendingRecoveryAt = 0;
			return;
		}
		state.pendingRecoveryAt = 0;
		this.bumpStat(outcome === "completed" ? { recovered: 1 } : { failed: 1 });
		this.log(`恢复结果(${sessionId}): ${outcome === "completed" ? "成功" : "失败"}`);
	}
	/** 立即为该会话发送一次自动继续(无视冷却与连续上限; 由通知按钮触发)。 */
	async resumeNow(sessionId) {
		if (this.disposed) return;
		const state = this.state(sessionId);
		if (state.subagent) return;
		if (state.pendingTimer !== void 0) {
			clearTimeout(state.pendingTimer);
			state.pendingTimer = void 0;
		}
		try {
			await this.fire(sessionId, "manual:notification", true);
		} catch (error) {
			console.error(`[dsh-session-resilience] 手动续跑异常 ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	/** 本会话当前生效的冷却间隔(自适应退避)。 */
	cooldownFor(state) {
		const config = this.getConfig();
		return effectiveCooldown(state.consecutive, config.cooldownMs, config.backoffFactor, config.backoffMaxMs);
	}
	schedule(sessionId, reason) {
		const state = this.state(sessionId);
		const config = this.getConfig();
		if (state.subagent) return;
		if (config.paused) {
			this.log(`跳过 ${sessionId}(${reason}): 全局暂停中`);
			return;
		}
		if (Date.now() < (this.pauseUntil.get(sessionId) ?? 0)) {
			this.log(`跳过 ${sessionId}(${reason}): 会话暂停中`);
			return;
		}
		if (state.pendingTimer !== void 0) return;
		if (Date.now() - state.lastAttemptAt < this.cooldownFor(state)) return;
		if (state.consecutive >= config.maxConsecutive) {
			this.log(`跳过 ${sessionId}(${reason}): 已连续自动继续 ${state.consecutive} 次, 等待用户介入或成功回合`);
			return;
		}
		const timer = setTimeout(() => {
			if (state.pendingTimer !== timer) return;
			state.pendingTimer = void 0;
			try {
				this.fire(sessionId, reason);
			} catch (error) {
				console.error(`[dsh-session-resilience] 定时发送异常 ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}, config.graceMs);
		state.pendingTimer = timer;
		const template = reason.startsWith("loop:") ? config.loopText : reason.includes("max-tokens") ? config.continueTextMaxTokens : config.continueText;
		this.log(`检测到非人为中断 ${sessionId}(${reason}), ${config.graceMs}ms 后自动发送「${template}」`);
	}
	cancelPending(sessionId, why) {
		const state = this.state(sessionId);
		if (state.pendingTimer === void 0) return;
		clearTimeout(state.pendingTimer);
		state.pendingTimer = void 0;
		this.log(`取消 ${sessionId} 的自动继续(${why})`);
	}
	fire(sessionId, reason, force = false) {
		if (this.disposed) return;
		const state = this.state(sessionId);
		const config = this.getConfig();
		if (!config.enabled) return;
		if (state.subagent) return;
		if (config.paused) {
			this.log(`跳过 ${sessionId}(${reason}): 全局暂停中`);
			return;
		}
		if (Date.now() < (this.pauseUntil.get(sessionId) ?? 0)) {
			this.log(`跳过 ${sessionId}(${reason}): 会话暂停中`);
			return;
		}
		if (!force && Date.now() - state.lastAttemptAt < this.cooldownFor(state)) {
			this.log(`跳过 ${sessionId}(${reason}): 处于冷却期`);
			return;
		}
		if (!force && state.consecutive >= config.maxConsecutive) {
			this.log(`跳过 ${sessionId}(${reason}): 已连续自动继续 ${state.consecutive} 次, 等待用户介入或成功回合`);
			return;
		}
		const template = reason.startsWith("loop:") ? config.loopText : reason.includes("max-tokens") ? config.continueTextMaxTokens : config.continueText;
		const text = this.buildContinueText(config, state, template);
		const agent = this.ctx.agents.get(sessionId);
		if (agent === void 0) {
			this.log(`跳过 ${sessionId}(${reason}): 无 live agent`);
			return;
		}
		state.lastAttemptAt = Date.now();
		try {
			const message = createUserMessage({
				content: [{
					type: "text",
					text
				}],
				source: {
					kind: PLUGIN_NAME$1,
					form: "instructions"
				}
			});
			trackPendingEcho(state, message.id);
			try {
				agent.followup(message);
			} catch (error) {
				forgetPendingEcho(state, message.id);
				throw error;
			}
			const now = Date.now();
			state.consecutive += 1;
			state.pendingRecoveryAt = now;
			this.bumpStat({
				sent: 1,
				...state.lastFailure !== void 0 ? { code: state.lastFailure.code } : {}
			});
			this.log(`已自动发送「${text}」到 ${sessionId}(${reason}), 第 ${state.consecutive} 次连续`);
			if (config.notify) {
				const copy = NOTICE_COPY[config.locale];
				this.notify(sessionId, copy.continuedTitle, copy.continuedBody(sessionId, text, state.consecutive), this.notifyOptions(sessionId, config.locale));
			}
			if (state.consecutive >= config.maxConsecutive) {
				this.bumpStat({ gaveUp: 1 });
				this.log(`达到连续上限 ${config.maxConsecutive} 次, 停止自动继续 ${sessionId}`);
				if (config.notify) {
					const copy = NOTICE_COPY[config.locale];
					this.notify(sessionId, copy.stoppedTitle, copy.stoppedBody(sessionId, state.consecutive), this.notifyOptions(sessionId, config.locale));
				}
			}
		} catch (error) {
			this.log(`发送异常 ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	/**
	* 组装本次续跑消息: 模板填充 + 幂等护栏。
	* 护栏依据上一步工具调用的执行状态附加指引, 防止重跑副作用操作:
	* - 结果未确认(可能已部分执行)→ 提示先确认状态、不要重复执行
	* - 已确认成功 → 提示已完成、不要重复执行
	* - 已失败 → 不加护栏(重试工具本来就是目的)
	*/
	buildContinueText(config, state, template) {
		const tool = state.tools.lastTool();
		const turn = state.lastTurn;
		let text = fillTemplate(template, {
			errorCount: state.consecutive + 1,
			...state.lastFailure !== void 0 ? { facts: state.lastFailure } : {},
			...tool !== void 0 ? { tool } : {},
			...turn !== void 0 ? { turn } : {},
			...state.lastFailureAt > 0 ? { elapsedMs: Date.now() - state.lastFailureAt } : {}
		});
		if (!config.guardTools) return text;
		const guard = this.currentGuard(state);
		if (guard.kind === "pending") text += ` ${fillTemplate(config.guardPendingText, {
			...guard.tool !== void 0 ? { tool: guard.tool } : {},
			...guard.result !== void 0 ? { result: guard.result } : {}
		})}`;
		else if (guard.kind === "done") text += ` ${fillTemplate(config.guardDoneText, {
			...guard.tool !== void 0 ? { tool: guard.tool } : {},
			...guard.result !== void 0 ? { result: guard.result } : {}
		})}`;
		return text;
	}
	/** 上一步工具调用的护栏状态(实时路径, 由 mux 帧维护)。 */
	currentGuard(state) {
		return state.tools.guard();
	}
	async bootScanLoop() {
		await this.scanLoop(Infinity, 3e3);
	}
	/** 反复尝试扫描, 直到成功(宿主就绪)或达到次数上限。 */
	async scanLoop(attempts, delayMs) {
		for (let attempt = 0; attempt < attempts && !this.disposed; attempt += 1) {
			try {
				if (await this.scanInterrupted()) return;
			} catch (error) {
				if (this.disposed) return;
				if (attempt % 10 === 0) this.log(`扫描失败(${attempt + 1}/${attempts === Infinity ? "∞" : attempts}): ${error instanceof Error ? error.message : String(error)}`);
			}
			if (attempt + 1 < attempts) await sleep(delayMs);
		}
	}
	/**
	* 扫描最近中断过的会话: 最后回合以非人为原因结束, 且其后没有新回合或用户消息。
	* @returns 是否成功完成一次扫描(宿主就绪)。
	*/
	async scanInterrupted() {
		const config = this.getConfig();
		if (!config.enabled) return true;
		if (config.paused) return true;
		const now = Date.now();
		const candidates = [];
		for (const agent of this.ctx.agents.list()) {
			const session = agent.session;
			if (session.header.origin === "subagent") continue;
			const events = snapshotSessionEvents(session);
			const lastActivityAt = events.reduce((latest, event) => Math.max(latest, event.time), Number.isFinite(session.header.createdAt) ? session.header.createdAt : 0);
			candidates.push({
				sessionId: session.id,
				events,
				lastActivityAt,
				listIndex: candidates.length
			});
		}
		candidates.sort((left, right) => right.lastActivityAt - left.lastActivityAt || left.listIndex - right.listIndex);
		for (const candidate of candidates.slice(0, config.scanLimit)) {
			if (this.disposed) return true;
			const state = this.state(candidate.sessionId);
			if (state.pendingTimer !== void 0) continue;
			if (state.consecutive >= config.maxConsecutive) continue;
			if (now - state.lastAttemptAt < this.cooldownFor(state)) continue;
			if (now < (this.pauseUntil.get(candidate.sessionId) ?? 0)) continue;
			const events = candidate.events;
			let lastEnd;
			for (let i = events.length - 1; i >= 0; i -= 1) {
				const event = events[i];
				if (event !== void 0 && event.type === "turn/end") {
					lastEnd = event;
					break;
				}
			}
			if (lastEnd === void 0) continue;
			const reason = lastEnd.data.reason;
			const reasonKind = readReasonKind(reason);
			if (reasonKind === void 0 || !isNonHumanReason(reasonKind)) continue;
			if (lastEnd.time < now - config.freshMs) continue;
			let superseded = false;
			for (const event of events) {
				if (event.seq <= lastEnd.seq) continue;
				if (event.type === "turn/start") superseded = true;
				if (event.type === "user/message" && event.data.source.kind === "user") superseded = true;
				if (superseded) break;
			}
			if (superseded) continue;
			this.applyGuardFromEvents(state, events, lastEnd.seq);
			const scanReason = `scan:turn/end:${reasonKind}`;
			this.log(`扫描发现中断 ${candidate.sessionId}(turn/end:${reasonKind}), 交给恢复策略处理`);
			if (reasonKind === "error") {
				const failure = parseFailureFacts(reason.error);
				if (failure === void 0) {
					console.error(`[dsh-session-resilience] 忽略畸形扫描 turn/end ${candidate.sessionId}: error details 无法解释`);
					continue;
				}
				state.lastFailure = failure;
				state.lastTurn = lastEnd.data.turn;
				state.lastFailureAt = lastEnd.time;
				this.onTurnFailure(candidate.sessionId, scanReason, state.lastFailure);
			} else this.schedule(candidate.sessionId, scanReason);
		}
		return true;
	}
	/** 从历史事件恢复上一步工具调用状态(扫描路径的幂等护栏)。 */
	applyGuardFromEvents(state, events, untilSeq) {
		state.tools.restore(events, untilSeq);
	}
};
//#endregion
//#region lib/types/restart.js
/** Host-side restart controller shared by the restart buttons and the model tool. */
const PLUGIN_NAME = "dsh-session-resilience";
const INSTANCE_ID = `${process.pid}-${Date.now()}`;
const HELPER_FILE = fileURLToPath(new URL("./restart-helper.cjs", import.meta.url));
function dshHome() {
	return process.env.DSH_HOME ?? join(homedir(), ".dsh");
}
function resumePath() {
	return join(dshHome(), "dsh-session-resilience-resume.json");
}
function markerPath(port) {
	return join(dshHome(), `dsh-session-resilience-${port}.json`);
}
function flagPath() {
	return join(dshHome(), "dsh-restarting.flag");
}
function stopFlagPath() {
	return join(dshHome(), "dsh-stopped.flag");
}
function logPath(kind) {
	const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").slice(0, 19);
	return join(process.env.TEMP ?? "/tmp", `dsh-session-resilience-${stamp}.${kind}.log`);
}
function bestEffortWrite(path, value) {
	try {
		writeFileSync(path, JSON.stringify(value, null, 2), "utf8");
	} catch {}
}
function clear(path) {
	try {
		unlinkSync(path);
	} catch {}
}
function readRecord() {
	try {
		const value = JSON.parse(readFileSync(resumePath(), "utf8"));
		if (!Array.isArray(value.sessionIds)) return void 0;
		const sessionIds = value.sessionIds.filter((id) => typeof id === "string" && id !== "");
		if (sessionIds.length === 0 || typeof value.restartAt !== "string") return void 0;
		const pid = typeof value.pid === "number" ? value.pid : 0;
		return {
			sessionIds,
			restartAt: value.restartAt,
			pid
		};
	} catch {
		return;
	}
}
function currentLaunchUrl(port) {
	try {
		const marker = JSON.parse(readFileSync(markerPath(port), "utf8"));
		return marker.newPid === process.pid && typeof marker.launchUrl === "string" ? marker.launchUrl : void 0;
	} catch {
		return;
	}
}
function runningSessionIds(ctx) {
	try {
		return [...new Set(ctx.agents.roots().filter((agent) => agent.status === "running").map((agent) => String(agent.id)))];
	} catch {
		return [];
	}
}
function baseRelaunchArgs() {
	const args = [...process.argv.slice(1)];
	const index = args.indexOf("--port");
	if (index !== -1) args.splice(index, 2);
	return args;
}
function relaunchSpec(port) {
	return {
		file: process.execPath,
		args: [
			...process.execArgv,
			...baseRelaunchArgs(),
			"--port",
			String(port)
		],
		cwd: process.cwd()
	};
}
/** Resolve the active Web port without making 3080 a second profile. */
function resolvePort(ctx, fallback = 3080) {
	const index = process.argv.indexOf("--port");
	const argument = index === -1 ? void 0 : process.argv[index + 1];
	const value = argument === void 0 ? void 0 : Number(argument);
	if (value !== void 0 && Number.isInteger(value) && value > 0) return value;
	try {
		const bound = ctx.get("webServer")?.port;
		if (typeof bound === "number" && bound > 0) return bound;
	} catch {}
	return fallback;
}
/** Accept requests that reached the host directly from the local machine. */
function isLoopbackRequest(req) {
	const address = req.socket?.remoteAddress;
	return (address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1") && req.headers.forwarded === void 0 && req.headers["x-forwarded-for"] === void 0 && req.headers["x-real-ip"] === void 0;
}
/** Accept a local request only when its browser origin matches the host. */
function trustedLoopback(req) {
	if (!isLoopbackRequest(req)) return false;
	const origin = req.headers.origin;
	const host = req.headers.host;
	if (typeof origin !== "string" || typeof host !== "string") return false;
	try {
		const parsed = new URL(origin);
		return (parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.host === host;
	} catch {
		return false;
	}
}
function json(res, status, value) {
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store"
	});
	res.end(JSON.stringify(value));
}
function scheduleExit(ctx) {
	setTimeout(() => {
		try {
			const exit = ctx.get("appExit");
			if (typeof exit === "function") exit(0);
		} catch {}
		setTimeout(() => {
			try {
				process.kill(process.pid, "SIGTERM");
			} catch {}
		}, 12e3);
	}, 2e3);
}
function restart(ctx, port) {
	const sessionIds = runningSessionIds(ctx);
	const out = logPath("out");
	const err = logPath("err");
	const marker = markerPath(port);
	try {
		writeFileSync(flagPath(), String(Date.now()), "utf8");
		writeFileSync(resumePath(), JSON.stringify({
			sessionIds,
			restartAt: (/* @__PURE__ */ new Date()).toISOString(),
			pid: process.pid
		}, null, 2), "utf8");
		writeFileSync(marker, JSON.stringify({
			from: INSTANCE_ID,
			oldPid: process.pid,
			port,
			requestedAt: (/* @__PURE__ */ new Date()).toISOString()
		}, null, 2), "utf8");
	} catch (error) {
		clear(flagPath());
		clear(resumePath());
		clear(marker);
		throw new Error(`cannot prepare restart handoff: ${error instanceof Error ? error.message : String(error)}`);
	}
	let helper;
	try {
		helper = spawn(process.execPath, [HELPER_FILE, JSON.stringify({
			oldPid: process.pid,
			port,
			markerPath: marker,
			logOut: out,
			logErr: err,
			relaunch: relaunchSpec(port)
		})], {
			detached: true,
			stdio: "ignore",
			windowsHide: true,
			env: process.env
		});
	} catch (error) {
		clear(flagPath());
		clear(resumePath());
		clear(marker);
		throw new Error(`cannot start restart helper: ${error instanceof Error ? error.message : String(error)}`);
	}
	helper.once("error", (error) => {
		console.error(`[${PLUGIN_NAME}] restart helper failed: ${error.message}`);
	});
	helper.unref();
	scheduleExit(ctx);
	return {
		ok: true,
		action: "restart",
		instanceId: INSTANCE_ID,
		oldPid: process.pid,
		port,
		...helper.pid === void 0 ? {} : { helperPid: helper.pid },
		sessionIds,
		logOut: out,
		logErr: err
	};
}
function shutdown(ctx, port) {
	bestEffortWrite(stopFlagPath(), String(Date.now()));
	clear(flagPath());
	scheduleExit(ctx);
	return {
		ok: true,
		instanceId: INSTANCE_ID,
		pid: process.pid,
		port,
		action: "shutdown"
	};
}
/** Owns the public restart routes and the durable post-restart handoff. */
var RestartController = class {
	ctx;
	getConfig;
	routeDisposers = [];
	resumeDisposer;
	resumeTimer;
	pending = /* @__PURE__ */ new Set();
	resumeDeadline = 0;
	disposed = false;
	constructor(ctx, getConfig) {
		this.ctx = ctx;
		this.getConfig = getConfig;
		this.resumeDisposer = ctx.on("agent/created", ({ agent }) => {
			this.deliver(agent);
		});
		this.startResume();
	}
	mountRoutes() {
		this.routeDisposers.push(this.ctx.webServer.register({
			kind: "exact",
			path: "/dsh-restart/health",
			handler: (req, res) => {
				if (!isLoopbackRequest(req)) {
					json(res, 403, {
						ok: false,
						error: "local requests only"
					});
					return;
				}
				json(res, 200, {
					ok: true,
					instanceId: INSTANCE_ID,
					ts: Date.now()
				});
			}
		}));
		this.routeDisposers.push(this.ctx.webServer.register({
			kind: "exact",
			path: "/dsh-restart/status",
			handler: (req, res) => {
				if (!isLoopbackRequest(req)) {
					json(res, 403, {
						ok: false,
						error: "local requests only"
					});
					return;
				}
				const marker = readRecord();
				const launchUrl = currentLaunchUrl(resolvePort(this.ctx));
				json(res, 200, {
					ok: true,
					instanceId: INSTANCE_ID,
					restarted: marker !== void 0 && marker.pid !== process.pid,
					...launchUrl === void 0 ? {} : { launchUrl }
				});
			}
		}));
		this.routeDisposers.push(this.ctx.webServer.register({
			kind: "exact",
			path: "/dsh-restart/restart",
			handler: (req, res) => {
				if (req.method !== "POST") {
					json(res, 405, {
						ok: false,
						error: "method not allowed"
					});
					return;
				}
				if (!trustedLoopback(req)) {
					json(res, 403, {
						ok: false,
						error: "untrusted origin"
					});
					return;
				}
				json(res, 200, restart(this.ctx, resolvePort(this.ctx)));
			}
		}));
		this.routeDisposers.push(this.ctx.webServer.register({
			kind: "exact",
			path: "/dsh-restart/shutdown",
			handler: (req, res) => {
				if (req.method !== "POST") {
					json(res, 405, {
						ok: false,
						error: "method not allowed"
					});
					return;
				}
				if (!trustedLoopback(req)) {
					json(res, 403, {
						ok: false,
						error: "untrusted origin"
					});
					return;
				}
				json(res, 200, shutdown(this.ctx, resolvePort(this.ctx)));
			}
		}));
	}
	/** Restart the active web host for a model-facing tool call. */
	restartForTool() {
		return restart(this.ctx, resolvePort(this.ctx));
	}
	/** Stop the active web host without scheduling a replacement process. */
	shutdownForTool() {
		return shutdown(this.ctx, resolvePort(this.ctx));
	}
	dispose() {
		this.disposed = true;
		this.resumeDisposer();
		if (this.resumeTimer !== void 0) clearInterval(this.resumeTimer);
		for (const dispose of this.routeDisposers.splice(0)) dispose();
	}
	startResume() {
		const config = this.getConfig();
		if (!config.enabled || !config.restartAutoContinue) return;
		const record = readRecord();
		if (record === void 0) return;
		const startedAt = Date.parse(record.restartAt);
		this.resumeDeadline = (Number.isFinite(startedAt) ? startedAt : Date.now()) + config.restartResumeWindowMs;
		this.pending = new Set(record.sessionIds);
		for (const agent of this.ctx.agents.list()) this.deliver(agent);
		if (this.pending.size === 0) {
			clear(resumePath());
			return;
		}
		this.resumeTimer = setInterval(() => {
			if (this.disposed) return;
			const current = this.getConfig();
			if (!current.enabled || !current.restartAutoContinue || Date.now() >= this.resumeDeadline) {
				this.finishResume();
				return;
			}
			for (const sessionId of [...this.pending]) {
				const agent = this.ctx.agents.get(SessionId(sessionId));
				if (agent !== void 0) this.deliver(agent);
			}
		}, 500);
	}
	deliver(agent) {
		const sessionId = String(agent.id);
		if (!this.pending.has(sessionId)) return;
		try {
			agent.followup(createUserMessage({
				content: [{
					type: "text",
					text: this.getConfig().continueText
				}],
				source: {
					kind: PLUGIN_NAME,
					form: "instructions"
				}
			}));
			this.pending.delete(sessionId);
			if (this.pending.size === 0) this.finishResume();
		} catch {}
	}
	finishResume() {
		if (this.resumeTimer !== void 0) clearInterval(this.resumeTimer);
		this.resumeTimer = void 0;
		clear(resumePath());
	}
};
//#endregion
//#region lib/types/index.js
/** Settings namespace of the auto-continue plugin (lowercase kebab-case). */
const AUTO_CONTINUE_NS = "dsh-session-resilience";
const SETTINGS_NS = AUTO_CONTINUE_NS;
function jsonResponse(res, status, value) {
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store"
	});
	res.end(JSON.stringify(value));
}
/** Wire schema; blank localized text fields tell resolveConfig() to select the active locale's defaults. */
const AutoContinueSchema = Schema.object({
	/** Named recovery policy; Manual leaves the individual recovery controls active. */
	recoveryPreset: Schema.union([
		"manual",
		"safe",
		"balanced",
		"long-task"
	]).default("manual"),
	/** Master switch for all automatic continuation behavior. */
	enabled: Schema.boolean().default(true),
	/** Continue sessions that were active when the host was deliberately restarted. */
	restartAutoContinue: Schema.boolean().default(true),
	/** How long a recorded restart handoff remains valid for a browser reconnect. */
	restartResumeWindowMs: Schema.natural(),
	/** Active browser/UI locale mirrored by the client. */
	locale: Schema.string().default("zh"),
	/** Text automatically sent after an interruption. */
	continueText: Schema.string().default(""),
	/** Text sent when the output token ceiling is reached (same placeholders as `continueText`). */
	continueTextMaxTokens: Schema.string().default(""),
	/** Idempotency guard: inspect the last tool call before resuming and steer the model. */
	guardTools: Schema.boolean().default(true),
	/** Guard text appended when the last tool call has no confirmed result (it may have partially executed). */
	guardPendingText: Schema.string().default(""),
	/** Guard text appended when the last tool call completed successfully (don't rerun it). */
	guardDoneText: Schema.string().default(""),
	/** Grace period after an interruption before auto-sending (ms). */
	graceMs: Schema.natural(),
	/** Minimum interval between two auto-continues per session (ms). */
	cooldownMs: Schema.natural(),
	/** Max consecutive auto-continues per session before stopping. */
	maxConsecutive: Schema.natural().min(1),
	/** Scan recently interrupted sessions on page load / reconnect. */
	scanOnBoot: Schema.boolean().default(true),
	/** Max sessions the scan checks (most recently updated). */
	scanLimit: Schema.natural().min(1),
	/** Scan only considers interruptions inside this window (ms). */
	freshMs: Schema.natural(),
	/** Log `[auto-continue]` lines to the browser console. */
	verbose: Schema.boolean().default(true),
	/** Classify failures: auto-continue transient errors only; permanent ones are skipped and notified. */
	classify: Schema.boolean().default(true),
	/** Provider-specific message/code/status fragments that explicitly count as retryable, one literal per line. */
	retryableErrorPatterns: Schema.string().default(""),
	/** Cooldown multiplier per consecutive failure (adaptive backoff). */
	backoffFactor: Schema.natural().min(1),
	/** Cap on the effective backoff interval (ms). */
	backoffMaxMs: Schema.natural(),
	/** Show browser notifications for auto-continue events. */
	notify: Schema.boolean().default(false),
	/** Globally pause auto-continue: no live or scan send. */
	paused: Schema.boolean().default(false),
	/** Loop guard: detect a running turn spinning in place and restart it. */
	loopGuard: Schema.boolean().default(true),
	/** A model message shorter than this many chars counts as a short sentence (loop signal). */
	loopShortChars: Schema.natural().min(1).default(40),
	/** Consecutive short sentences within this window (ms) with no tool call in between trip the loop guard. */
	loopWindowMs: Schema.natural().min(1e3).default(3e4),
	/** Consecutive short sentences trip the loop guard. */
	loopShortCount: Schema.natural().min(2).default(12),
	/** Consecutive identical assistant messages trip the loop guard (strongest signal; also used for streamed intra-message repetition). */
	loopRepeatText: Schema.natural().min(2).default(4),
	/** Consecutive identical tool calls with identical arguments AND results trip the loop guard. */
	loopToolRepeat: Schema.natural().min(2).default(5),
	/** Text sent after the loop guard cancels and restarts a turn (supports {tool}). */
	loopText: Schema.string().default("")
});
/** Config schema consumed by the active profile entry and SettingsForms. */
const Config = AutoContinueSchema;
const RESTART_OUTPUT = {
	schema: {
		type: "object",
		additionalProperties: false,
		properties: {
			ok: {
				type: "boolean",
				required: true,
				const: true
			},
			action: {
				type: "string",
				required: true,
				enum: ["restart"]
			},
			instanceId: {
				type: "string",
				required: true
			},
			oldPid: {
				type: "integer",
				required: true
			},
			port: {
				type: "integer",
				required: true
			},
			helperPid: { type: "integer" },
			sessionIds: {
				type: "array",
				items: { type: "string" },
				required: true
			},
			logOut: {
				type: "string",
				required: true
			},
			logErr: {
				type: "string",
				required: true
			}
		}
	},
	render: (_args, value) => [{
		type: "text",
		text: `DSH restart scheduled on port ${String(value.port)}. The host will reconnect and continue the active session automatically.`
	}]
};
const SHUTDOWN_OUTPUT = {
	schema: {
		type: "object",
		additionalProperties: false,
		properties: {
			ok: {
				type: "boolean",
				required: true,
				const: true
			},
			action: {
				type: "string",
				required: true,
				enum: ["shutdown"]
			},
			instanceId: {
				type: "string",
				required: true
			},
			pid: {
				type: "integer",
				required: true
			},
			port: {
				type: "integer",
				required: true
			}
		}
	},
	render: (_args, value) => [{
		type: "text",
		text: `DSH shutdown scheduled for port ${String(value.port)}. No replacement host will be launched.`
	}]
};
/**
* Plugin body: configure settings for this profile entry, start the single-instance
* engine, and serve the status bridge.
* @param ctx - host plugin context.
*/
function apply(ctx) {
	ctx.inject(["settings"], (settingsCtx) => {
		settingsCtx.effect(() => settingsCtx.settings.configure({ auto: false }, ctx.fiber));
	});
	let runnerRef;
	let restartRef;
	let toolDisposers = [];
	let bridgeDispose;
	ctx.inject([
		"settings",
		"agents",
		"webServer",
		"tools"
	], (engineCtx) => {
		bridgeDispose?.();
		bridgeDispose = void 0;
		if (runnerRef !== void 0) runnerRef.dispose();
		restartRef?.dispose();
		for (const dispose of toolDisposers.splice(0)) dispose();
		const readSettings = () => engineCtx.settings.describe().find((entry) => entry.ns === SETTINGS_NS)?.value;
		const runner = new AutoContinueRunner(engineCtx, () => resolveConfig(readSettings()));
		runnerRef = runner;
		const restartController = new RestartController(engineCtx, () => resolveConfig(readSettings()));
		restartController.mountRoutes();
		restartRef = restartController;
		toolDisposers = [engineCtx.tools.register(defineTool({
			name: "restart_dsh",
			description: "Restart the active DSH web host on its configured port. Use only when the user requested a restart or the current task requires it. The plugin records running sessions before exit and automatically continues them after the host reconnects.",
			parameters: {},
			output: RESTART_OUTPUT,
			execute: () => Promise.resolve(restartController.restartForTool()),
			presentCall: () => ({
				card: "generic",
				title: "Restart DSH",
				kind: "execute"
			})
		})), engineCtx.tools.register(defineTool({
			name: "shutdown_dsh",
			description: "Stop the active DSH web host on its configured port without launching a replacement process. Use only when the user explicitly asks to stop DSH.",
			parameters: {},
			output: SHUTDOWN_OUTPUT,
			execute: () => Promise.resolve(restartController.shutdownForTool()),
			presentCall: () => ({
				card: "generic",
				title: "Stop DSH",
				kind: "delete"
			})
		}))];
		const sseClients = /* @__PURE__ */ new Set();
		const pushToAll = (data) => {
			for (const client of sseClients) try {
				client.send(data);
			} catch {
				sseClients.delete(client);
			}
		};
		const statePayload = () => JSON.stringify({
			type: "state",
			stats: runner.todayStats(),
			paused: runner.activePauses()
		});
		const disposeNoticeSubscription = runner.subscribeNotices(() => {
			for (const notice of runner.drainNotices()) pushToAll(`data: ${JSON.stringify({
				type: "notice",
				notice
			})}\n\n`);
		});
		const disposeStateSubscription = runner.subscribeState(() => {
			pushToAll(`data: ${statePayload()}\n\n`);
		});
		const bridgeRouteDisposers = [];
		bridgeRouteDisposers.push(engineCtx.webServer.register({
			kind: "exact",
			path: "/api/auto-continue-bridge",
			handler: (req, res) => {
				if (req.method !== "GET") {
					jsonResponse(res, 405, {
						ok: false,
						error: "method not allowed"
					});
					return;
				}
				if (!isLoopbackRequest(req)) {
					jsonResponse(res, 403, {
						ok: false,
						error: "local requests only"
					});
					return;
				}
				res.writeHead(200, {
					"content-type": "text/event-stream",
					"cache-control": "no-cache",
					connection: "keep-alive"
				});
				res.write(`data: ${statePayload()}\n\n`);
				const client = {
					send: (data) => {
						res.write(data);
					},
					close: () => {
						res.end();
					}
				};
				sseClients.add(client);
				req.on("close", () => sseClients.delete(client));
			}
		}));
		bridgeRouteDisposers.push(engineCtx.webServer.register({
			kind: "exact",
			path: "/api/auto-continue-action",
			handler: (req, res) => {
				if (req.method !== "POST") {
					jsonResponse(res, 405, {
						ok: false,
						error: "method not allowed"
					});
					return;
				}
				if (!trustedLoopback(req)) {
					jsonResponse(res, 403, {
						ok: false,
						error: "untrusted origin"
					});
					return;
				}
				let body = "";
				let rejected = false;
				req.on("data", (chunk) => {
					if (rejected) return;
					body += chunk.toString("utf8");
					if (Buffer.byteLength(body, "utf8") > 4096) {
						rejected = true;
						jsonResponse(res, 413, {
							ok: false,
							error: "request body too large"
						});
						req.destroy();
					}
				});
				req.on("end", () => {
					if (rejected) return;
					try {
						const parsed = JSON.parse(body);
						const action = parsed.action;
						if (action !== "resume" && action !== "pause1h" && action !== "unpause" && action !== "reset-stats") {
							jsonResponse(res, 400, {
								ok: false,
								error: "unknown action"
							});
							return;
						}
						const sessionId = typeof parsed.sessionId === "string" && parsed.sessionId !== "" ? SessionId(parsed.sessionId) : void 0;
						if (action !== "reset-stats" && sessionId === void 0) {
							jsonResponse(res, 400, {
								ok: false,
								error: "sessionId is required"
							});
							return;
						}
						runner.handleNoticeAction(sessionId, action);
						jsonResponse(res, 200, { ok: true });
					} catch {
						jsonResponse(res, 400, {
							ok: false,
							error: "invalid JSON"
						});
					}
				});
			}
		}));
		bridgeDispose = () => {
			for (const client of sseClients) client.close();
			sseClients.clear();
			disposeNoticeSubscription();
			disposeStateSubscription();
			for (const dispose of bridgeRouteDisposers.splice(0)) dispose();
		};
	});
	ctx.effect(() => () => {
		bridgeDispose?.();
		bridgeDispose = void 0;
		const runner = runnerRef;
		runnerRef = void 0;
		if (runner !== void 0) runner.dispose();
		const restart = restartRef;
		restartRef = void 0;
		restart?.dispose();
		for (const dispose of toolDisposers.splice(0)) dispose();
	});
}
//#endregion
export { AUTO_CONTINUE_NS, AutoContinueSchema, Config, apply };
