import { createRequire } from "node:module";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { Service } from "@deepseek-ai/cordis";
import { spawn } from "node:child_process";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
//#region ../../../vendor/cosmokit/lib/index.js
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
/** Binary source detection and base64/hex conversion helpers. */
var Binary;
(function(Binary) {
	Binary.is = isArrayBufferLike;
	Binary.isSource = isArrayBufferSource;
	function fromSource(source) {
		if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
		else return source;
	}
	Binary.fromSource = fromSource;
	function toBase64(source) {
		source = fromSource(source);
		if (typeof Buffer !== "undefined") return Buffer.from(source).toString("base64");
		let binary = "";
		const bytes = new Uint8Array(source);
		for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
		return btoa(binary);
	}
	Binary.toBase64 = toBase64;
	function fromBase64(source) {
		if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "base64"));
		return Uint8Array.from(atob(source), (c) => c.charCodeAt(0));
	}
	Binary.fromBase64 = fromBase64;
	function toHex(source) {
		source = fromSource(source);
		if (typeof Buffer !== "undefined") return Buffer.from(source).toString("hex");
		return Array.from(new Uint8Array(source), (byte) => byte.toString(16).padStart(2, "0")).join("");
	}
	Binary.toHex = toHex;
	function fromHex(source) {
		if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "hex"));
		const hex = source.length % 2 === 0 ? source : source.slice(0, source.length - 1);
		const buffer = [];
		for (let i = 0; i < hex.length; i += 2) buffer.push(parseInt(`${hex[i]}${hex[i + 1]}`, 16));
		return Uint8Array.from(buffer).buffer;
	}
	Binary.fromHex = fromHex;
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
/** Deeply compare arrays, dates, regexps, buffers, and plain object fields. */
function deepEqual(a, b, strict) {
	if (a === b) return true;
	if (!strict && isNullable(a) && isNullable(b)) return true;
	if (typeof a !== typeof b) return false;
	if (typeof a !== "object") return false;
	if (!a || !b) return false;
	function check(test, then) {
		return test(a) ? test(b) ? then(a, b) : false : test(b) ? false : void 0;
	}
	return check(Array.isArray, (a, b) => a.length === b.length && a.every((item, index) => deepEqual(item, b[index]))) ?? check(is("Date"), (a, b) => a.valueOf() === b.valueOf()) ?? check(is("RegExp"), (a, b) => a.source === b.source && a.flags === b.flags) ?? check(isArrayBufferLike, (a, b) => {
		if (a.byteLength !== b.byteLength) return false;
		const viewA = new Uint8Array(a);
		const viewB = new Uint8Array(b);
		for (let i = 0; i < viewA.length; i++) if (viewA[i] !== viewB[i]) return false;
		return true;
	}) ?? Object.keys({
		...a,
		...b
	}).every((key) => deepEqual(a[key], b[key], strict));
}
/** Time constants plus parsing and formatting helpers. */
var Time;
(function(Time) {
	Time.millisecond = 1;
	Time.second = 1e3;
	Time.minute = Time.second * 60;
	Time.hour = Time.minute * 60;
	Time.day = Time.hour * 24;
	Time.week = Time.day * 7;
	let timezoneOffset = (/* @__PURE__ */ new Date()).getTimezoneOffset();
	function setTimezoneOffset(offset) {
		timezoneOffset = offset;
	}
	Time.setTimezoneOffset = setTimezoneOffset;
	function getTimezoneOffset() {
		return timezoneOffset;
	}
	Time.getTimezoneOffset = getTimezoneOffset;
	function getDateNumber(date = /* @__PURE__ */ new Date(), offset) {
		if (typeof date === "number") date = new Date(date);
		if (offset === void 0) offset = timezoneOffset;
		return Math.floor((date.valueOf() / Time.minute - offset) / 1440);
	}
	Time.getDateNumber = getDateNumber;
	function fromDateNumber(value, offset) {
		const date = new Date(value * Time.day);
		if (offset === void 0) offset = timezoneOffset;
		return new Date(+date + offset * Time.minute);
	}
	Time.fromDateNumber = fromDateNumber;
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
		return (parseFloat(capture[1]) * Time.week || 0) + (parseFloat(capture[2]) * Time.day || 0) + (parseFloat(capture[3]) * Time.hour || 0) + (parseFloat(capture[4]) * Time.minute || 0) + (parseFloat(capture[5]) * Time.second || 0);
	}
	Time.parseTime = parseTime;
	function parseDate(date) {
		const parsed = parseTime(date);
		if (parsed) date = Date.now() + parsed;
		else if (/^\d{1,2}(:\d{1,2}){1,2}$/.test(date)) date = `${(/* @__PURE__ */ new Date()).toLocaleDateString()}-${date}`;
		else if (/^\d{1,2}-\d{1,2}-\d{1,2}(:\d{1,2}){1,2}$/.test(date)) date = `${(/* @__PURE__ */ new Date()).getFullYear()}-${date}`;
		return date ? new Date(date) : /* @__PURE__ */ new Date();
	}
	Time.parseDate = parseDate;
	function format(ms) {
		const abs = Math.abs(ms);
		if (abs >= Time.day - Time.hour / 2) return Math.round(ms / Time.day) + "d";
		else if (abs >= Time.hour - Time.minute / 2) return Math.round(ms / Time.hour) + "h";
		else if (abs >= Time.minute - Time.second / 2) return Math.round(ms / Time.minute) + "m";
		else if (abs >= Time.second) return Math.round(ms / Time.second) + "s";
		return ms + "ms";
	}
	Time.format = format;
	function toDigits(source, length = 2) {
		return source.toString().padStart(length, "0");
	}
	Time.toDigits = toDigits;
	function template(template, time = /* @__PURE__ */ new Date()) {
		return template.replace("yyyy", time.getFullYear().toString()).replace("yy", time.getFullYear().toString().slice(2)).replace("MM", toDigits(time.getMonth() + 1)).replace("dd", toDigits(time.getDate())).replace("hh", toDigits(time.getHours())).replace("mm", toDigits(time.getMinutes())).replace("ss", toDigits(time.getSeconds())).replace("SSS", toDigits(time.getMilliseconds(), 3));
	}
	Time.template = template;
})(Time || (Time = {}));
//#endregion
//#region ../../../vendor/schemastery/lib/index.mjs
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
const resolvers = {};
Schema.extend = function extend(type, resolve) {
	resolvers[type] = resolve;
};
Schema.resolve = function resolve(data, schema, options = {}, strict = false) {
	if (!schema) return [data];
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
		return schema.meta.default;
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
//#region ../../typert/protocol/lib/index.js
/** The one Remote failure class shared by owners, the Gateway, and consumers. */
/**
* One Remote call failure: a real Error carrying its stable code and typed
* details. Owners throw it at the failure point; the Host Gateway encodes it
* onto the wire unchanged; the Client face rebuilds an instance for the
* `RemoteResult` error branch, so `throw result.error` keeps throw semantics.
* Discrimination is always by `code`, never by instanceof.
*/
var RemoteError = class extends Error {
	code;
	details;
	/** Structural marker: cross-realm/bundle identification never uses instanceof. */
	isDSHRemoteError = true;
	/**
	* @param code - stable failure code declared in {@link RemoteErrorDetailsMap}.
	* @param message - human diagnostic carried across the wire.
	* @param details - structured payload typed by the code.
	* @param options - standard Error options (`cause` survives in-process only).
	*/
	constructor(code, message, details, options) {
		super(message, options);
		this.code = code;
		this.details = details;
		this.name = "RemoteError";
	}
};
/**
* Remote decorators and explicit Gateway bindings backed by versioned
* descriptors carried on decorated class prototypes. Strict reflection
* remains a Typert compiler responsibility.
* @module @deepseek-ai/dsh-typert-protocol
*/
const TYPERT_REMOTE_SEGMENT_PATTERN = /^[A-Za-z0-9_$.-]+$/;
/**
* Test one generated Remote name against the Connection endpoint grammar.
* @param value - namespace, method, lookup, or Context segment.
* @returns whether the value can cross the shared RPC carrier unchanged.
*/
function isTypertRemoteSegment(value) {
	return value !== "." && value !== ".." && TYPERT_REMOTE_SEGMENT_PATTERN.test(value);
}
const REMOTE_METHOD_DESCRIPTOR = "@deepseek-ai/dsh-typert-protocol/remote-methods";
/**
* Bind one visible Service field to a Cordis key and Remote namespace.
* @param service - owning Service instance, normally `this`.
* @param serviceKey - exact Cordis service key.
* @param options - optional distinct wire namespace.
* @returns a frozen, inspectable binding with no compiler-injected metadata.
*/
function bindTypertRemote(service, serviceKey, options = {}) {
	validateName("service key", serviceKey);
	const namespace = options.namespace ?? serviceKey;
	validateName("namespace", namespace);
	return Object.freeze({
		service,
		serviceKey,
		namespace
	});
}
/** Cordis Service base that exposes its registered name through Typert Gateway. */
var TypertRemoteService = class extends Service {
	/** Visible binding consumed by the Gateway's source-mode discovery. */
	typertRemote;
	/**
	* Register the Service and bind the same key to Typert Gateway.
	* @param ctx - owning Cordis Context.
	* @param serviceKey - exact Cordis service key and default wire namespace.
	* @param options - optional distinct wire namespace.
	*/
	constructor(ctx, serviceKey, options = {}) {
		super(ctx, serviceKey);
		this.typertRemote = bindTypertRemote(this, this.name, options);
	}
};
function Remote(methodExportOrOptions, context) {
	if (typeof methodExportOrOptions === "string") {
		validateName("Remote export name", methodExportOrOptions);
		return remoteDecorator({ kind: "direct" }, void 0, methodExportOrOptions);
	}
	if (typeof methodExportOrOptions === "object") {
		if (remoteOptionMode(methodExportOrOptions) !== "stream" || Reflect.ownKeys(methodExportOrOptions).length !== 1) throw new TypeError("typert-protocol: Remote options must contain exactly mode: \"stream\"");
		return remoteDecorator({ kind: "direct" }, "stream");
	}
	if (context === void 0) throw new TypeError("typert-protocol: Remote decorator context is missing");
	addMarkerInitializer(context, { kind: "direct" });
}
function remoteOptionMode(options) {
	return Reflect.get(options, "mode");
}
function remoteDecorator(invocation, mode, exportName) {
	return function(_method, context) {
		addMarkerInitializer(context, invocation, mode, exportName);
	};
}
function readRemoteMethodDescriptor(prototype) {
	const property = Object.getOwnPropertyDescriptor(prototype, REMOTE_METHOD_DESCRIPTOR);
	if (property === void 0) return void 0;
	const descriptor = property.value;
	if (descriptor === null || typeof descriptor !== "object") throw new TypeError("typert-protocol: Remote method descriptor must be an object");
	const version = Reflect.get(descriptor, "version");
	if (version !== 1) throw new TypeError(`typert-protocol: unsupported Remote method descriptor version ${String(version)}`);
	const methods = Reflect.get(descriptor, "methods");
	if (!Array.isArray(methods)) throw new TypeError("typert-protocol: Remote method descriptor methods must be an array");
	return descriptor;
}
function addMarkerInitializer(context, invocation, mode, exportName) {
	if (context.private || context.static || typeof context.name !== "string") throw new TypeError("typert-protocol: Remote decorators require a public instance method with a string name");
	const method = context.name;
	context.addInitializer(function() {
		const prototype = Object.getPrototypeOf(this);
		if (prototype === null) throw new TypeError(`typert-protocol: cannot mark Remote method "${method}" on an object without a prototype`);
		mark(prototype, method, invocation, mode, exportName);
	});
}
function mark(prototype, method, invocation, mode, exportName) {
	const descriptor = readRemoteMethodDescriptor(prototype);
	const marker = Object.freeze({
		method,
		...exportName === void 0 || exportName === method ? {} : { exportName },
		...mode === void 0 ? {} : { mode },
		invocation: Object.freeze(invocation)
	});
	const current = descriptor?.methods.find((candidate) => candidate.method === method);
	if (current !== void 0) {
		if (current.exportName === marker.exportName && current.mode === marker.mode && sameInvocation(current.invocation, invocation)) return;
		throw new Error(`typert-protocol: Remote method "${method}" has conflicting invocation markers`);
	}
	Object.defineProperty(prototype, REMOTE_METHOD_DESCRIPTOR, {
		configurable: true,
		value: Object.freeze({
			version: 1,
			methods: Object.freeze([...descriptor?.methods ?? [], marker])
		})
	});
}
function sameInvocation(left, right) {
	if (left.kind === "direct") return right.kind === "direct";
	if (right.kind === "direct") return false;
	return left.context === right.context;
}
function validateName(subject, value) {
	if (!isTypertRemoteSegment(value)) throw new TypeError(`typert-protocol: ${subject} must contain only RPC endpoint segment characters`);
}
//#endregion
//#region ../../util/values/lib/index.js
/**
* Deep-freeze an object graph in place while leaving live AbortSignal objects mutable.
* @param value - value to freeze.
* @returns the same value after every reachable enumerable child is frozen.
*/
function deepFreeze(value) {
	const seen = /* @__PURE__ */ new WeakSet();
	const pending = [{
		kind: "visit",
		node: value
	}];
	while (pending.length > 0) {
		const task = pending.pop();
		/* v8 ignore next -- the loop condition guarantees one pending task. */
		if (task === void 0) continue;
		if (task.kind === "property") {
			pending.push({
				kind: "visit",
				node: task.source[task.key]
			});
			continue;
		}
		const node = task.node;
		if (node === null || typeof node !== "object") continue;
		if (node instanceof AbortSignal) continue;
		if (seen.has(node)) continue;
		seen.add(node);
		Object.freeze(node);
		const keys = Object.keys(node);
		for (let index = keys.length - 1; index >= 0; index--) {
			const key = keys[index];
			/* v8 ignore next -- the loop is bounded by the captured key count. */
			if (key === void 0) continue;
			pending.push({
				kind: "property",
				source: node,
				key
			});
		}
	}
	return value;
}
//#endregion
//#region ../../util/crypto/lib/index.js
/**
* Random v4 UUID, minted from `crypto.getRandomValues`.
* @returns the UUID string.
*/
function randomUUID() {
	const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
	const hex = Array.from(bytes, (byte, index) => {
		return (index === 6 ? byte & 15 | 64 : index === 8 ? byte & 63 | 128 : byte).toString(16).padStart(2, "0");
	}).join("");
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
//#endregion
//#region ../../util/brand/lib/index.js
/**
* Duplicate-install-safe nominal primitive helpers.
*
* A brand makes structurally identical strings or numbers non-interchangeable
* at the type level: a `SessionId` cannot be passed where a `ToolCallId` is
* expected, and an event sequence cannot be passed as a log offset. Comparison,
* logging, and serialization retain the underlying primitive behavior.
*
* This package owns no concrete domain value and keeps no runtime identity or mutable
* state, so independently installed copies produce interchangeable values.
*
* @module @deepseek-ai/dsh-brand
*/
/**
* Apply a compile-time string brand without changing the value.
* @param value - string admitted by the domain that owns the target brand.
* @returns the same string with the requested compile-time brand.
*/
function brandString(value) {
	return value;
}
//#endregion
//#region ../../util/timeout/lib/index.js
/** Largest delay Node schedules without clamping it to one millisecond. */
const MAX_TIMER_DELAY_MS = 2147483647;
//#endregion
//#region ../../llm/llm/lib/index.js
/**
* Detach and deep-freeze a message whose identity already exists.
* @param message - complete message, including its stable identity.
* @returns an immutable snapshot that preserves the identity.
*/
function freezeMessage(message) {
	return deepFreeze(structuredClone(message));
}
/**
* Create one identified message and freeze it before publication.
* @param input - complete role, content, and source for a new message.
* @returns an immutable message with a fresh stable identity.
*/
function createMessage(input) {
	return freezeMessage({
		...input,
		id: brandString(randomUUID())
	});
}
/**
* Create one identified user-role message and freeze it before publication.
* @param input - complete content and source for a new user message.
* @returns an immutable user message with a fresh stable identity.
*/
function createUserMessage(input) {
	return createMessage({
		...input,
		role: "user"
	});
}
/**
* Harness error base with a stable machine-routable code and chained cause.
* Package errors extend it so tool results and replay can retain failure class.
* @module @deepseek-ai/dsh-llm/error
*/
/**
* Base class for all harness errors. Carries a `code` (stable, programmatic —
* e.g. `NO_ADAPTER`, `INVALID_ARGS`, `INVARIANT`) distinct from the
* human-readable `message`, and supports `cause` chaining via the standard
* `ErrorOptions`. `name` defaults to the subclass constructor name.
*/
var HarnessError = class extends Error {
	/** Stable machine-routable failure class (e.g. `RATE_LIMIT`); route on this, never by parsing `message`. */
	code;
	constructor(message, code, options) {
		super(message, options);
		this.code = code;
		this.name = new.target.name;
	}
};
/**
* Canonical provider-neutral code for a response that completed normally but
* carried no content blocks at all. Providers occasionally emit a degenerate
* completion (a terminal stop with zero output); adapters classify it as this
* failure instead of yielding an empty assistant message, because an empty
* message silently ends the turn with nothing for the user or the loop to act
* on. The attempt produced nothing durable, so retry policy treats it as safe
* to repeat.
*/
const EMPTY_RESPONSE_CODE = "EMPTY_RESPONSE";
new RegExp(String.raw`(?:^|[^a-z0-9])context[\s_-](?:length|window)[\s_-]` + String.raw`(?:exceed(?:ed|s)?|overflow(?:ed)?|limit[\s_-]exceeded)(?:$|[^a-z0-9])`, "i");
new RegExp(String.raw`\b(?:request|prompt|input|messages?)\s+(?:is\s+|are\s+)?` + String.raw`too\s+(?:large|long)\s+for\s+(?:(?:this|the)\s+)?` + String.raw`(?:model(?:'s)?\s+)?context(?:\s+window)?\b`, "i");
new RegExp(String.raw`\b(?:input|prompt|request|messages?)\b.{0,40}` + String.raw`\b(?:exceed(?:s|ed)?|overflows?|is\s+larger\s+than)\b.{0,40}` + String.raw`\b(?:the\s+)?(?:model(?:'s)?\s+)?context(?:\s+(?:length|window))?\b`, "i");
/**
* Provider-owned request-retry policy configuration and resolution.
*
* Adapters expose one resolved policy per registered provider route; the
* optional dsh-llm-retry plugin executes it on the agent's failed-step extension point.
*
* @module @deepseek-ai/dsh-llm/retry-policy
*/
const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_INITIAL_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 1e4;
const DEFAULT_JITTER_RATIO = .1;
const DEFAULT_RETRYABLE_CODES = Object.freeze([
	EMPTY_RESPONSE_CODE,
	"RATE_LIMIT",
	"SERVER",
	"TIMEOUT",
	"TRANSPORT"
]);
const backoffSchema = Schema.object({
	initialDelayMs: Schema.number().max(MAX_TIMER_DELAY_MS).default(DEFAULT_INITIAL_DELAY_MS),
	maxDelayMs: Schema.number().max(MAX_TIMER_DELAY_MS).default(DEFAULT_MAX_DELAY_MS),
	jitterRatio: Schema.number().min(0).max(1).default(DEFAULT_JITTER_RATIO)
});
const normalPolicySchema = Schema.object({
	mode: Schema.const("normal").required(),
	maxRetries: Schema.number().step(1).min(0).max(Number.MAX_SAFE_INTEGER).default(DEFAULT_MAX_RETRIES),
	retryableCodes: Schema.array(Schema.string()).default([...DEFAULT_RETRYABLE_CODES]),
	backoff: backoffSchema
});
const alwaysPolicySchema = Schema.object({
	mode: Schema.const("always").required(),
	backoff: backoffSchema
});
Schema.union([normalPolicySchema, alwaysPolicySchema]);
const NORMAL_POLICY_KEYS = new Set([
	"mode",
	"maxRetries",
	"retryableCodes",
	"backoff"
]);
const ALWAYS_POLICY_KEYS = new Set([
	"mode",
	"maxRetries",
	"retryableCodes",
	"backoff"
]);
const BACKOFF_KEYS = new Set([
	"initialDelayMs",
	"maxDelayMs",
	"jitterRatio"
]);
function validateKeys(value, allowed, path) {
	for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`${path}: unknown key "${key}"`);
}
function resolveBackoff(config, path) {
	if (config !== void 0) validateKeys(config, BACKOFF_KEYS, path);
	const initialDelayMs = config?.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
	const maxDelayMs = config?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
	const jitterRatio = config?.jitterRatio ?? DEFAULT_JITTER_RATIO;
	if (!Number.isFinite(initialDelayMs) || initialDelayMs <= 0 || initialDelayMs > 2147483647) throw new Error(`${path}.initialDelayMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`);
	if (!Number.isFinite(maxDelayMs) || maxDelayMs <= 0 || maxDelayMs > 2147483647) throw new Error(`${path}.maxDelayMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`);
	if (initialDelayMs > maxDelayMs) throw new Error(`${path}.initialDelayMs must be less than or equal to maxDelayMs`);
	if (!Number.isFinite(jitterRatio) || jitterRatio < 0 || jitterRatio > 1) throw new Error(`${path}.jitterRatio must be between 0 and 1`);
	return Object.freeze({
		initialDelayMs,
		maxDelayMs,
		jitterRatio
	});
}
/**
* Validate, default, and detach one provider-owned retry policy.
* @param config - optional provider configuration; omission selects normal defaults.
* @param path - diagnostic path naming the provider config that owns the value.
* @returns an immutable policy safe to capture in provider registration state.
*/
function resolveRetryPolicy(config, path) {
	if (config === void 0) return Object.freeze({
		mode: "normal",
		maxRetries: DEFAULT_MAX_RETRIES,
		retryableCodes: DEFAULT_RETRYABLE_CODES,
		...resolveBackoff(void 0, `${path}.backoff`)
	});
	switch (config.mode) {
		case "normal": {
			validateKeys(config, NORMAL_POLICY_KEYS, path);
			const maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
			const retryableCodes = config.retryableCodes ?? [...DEFAULT_RETRYABLE_CODES];
			if (!Number.isSafeInteger(maxRetries) || maxRetries < 0) throw new Error(`${path}.maxRetries must be a non-negative safe integer`);
			if (retryableCodes.length === 0) throw new Error(`${path}.retryableCodes must not be empty`);
			if (retryableCodes.some((code) => typeof code !== "string" || code.length === 0)) throw new Error(`${path}.retryableCodes must contain only non-empty strings`);
			if (new Set(retryableCodes).size !== retryableCodes.length) throw new Error(`${path}.retryableCodes must not contain duplicates`);
			return Object.freeze({
				mode: "normal",
				maxRetries,
				retryableCodes: Object.freeze([...retryableCodes]),
				...resolveBackoff(config.backoff, `${path}.backoff`)
			});
		}
		case "always":
			validateKeys(config, ALWAYS_POLICY_KEYS, path);
			return Object.freeze({
				mode: "always",
				...resolveBackoff(config.backoff, `${path}.backoff`)
			});
		default: throw new Error(`${path}.mode must be "normal" or "always"`);
	}
}
/**
* Field-wise equality over {@link LlmCallConfig} — the comparison a caller
* runs to decide whether a proposed configuration is a real change (worth a
* logged header snapshot) or the held one restated.
* @param a - one configuration.
* @param b - the other.
* @returns whether every field (including the `stop` list, element-wise) matches.
*/
function callConfigEquals(a, b) {
	if (a.provider !== b.provider || a.model !== b.model || a.reasoningEffort !== b.reasoningEffort || a.temperature !== b.temperature || a.maxTokens !== b.maxTokens) return false;
	if (a.stop === void 0 || b.stop === void 0) return a.stop === b.stop;
	return a.stop.length === b.stop.length && a.stop.every((s, i) => s === b.stop?.[i]);
}
/**
* Normalization for values thrown by a final LLM adapter boundary.
*
* @module @deepseek-ai/dsh-llm/adapter-failure
*/
/**
* Detach serializable provider facts from a value thrown by an adapter.
* @param value - arbitrary value thrown during adapter dispatch or iteration.
* @returns immutable provider-neutral facts suitable for a terminal finish chunk.
* @internal
*/
function normalizeLlmFailure(value) {
	const error = value instanceof Error ? value : new HarnessError(thrownMessage(value), "UNKNOWN", { cause: value });
	const carried = ownFailureSnapshot(error);
	if (carried !== void 0 && carried.code === ownErrorCode(error)) return carried;
	return Object.freeze({
		message: errorMessage(error),
		code: harnessErrorCode(error)
	});
}
/** Render a non-Error throw without letting hostile coercion escape normalization. */
function thrownMessage(value) {
	try {
		const message = String(value);
		return message.length > 0 ? message : "LLM adapter failed";
	} catch (_hostileThrownValue) {
		return "LLM adapter failed";
	}
}
/** Read a foreign error's own data-backed `code` without invoking accessors. */
function ownErrorCode(error) {
	try {
		const descriptor = Object.getOwnPropertyDescriptor(error, "code");
		return descriptor !== void 0 && "value" in descriptor ? descriptor.value : void 0;
	} catch (_sdkPropertyTrap) {
		return;
	}
}
/** Snapshot an own data property without invoking an SDK-defined accessor. */
function ownFailureSnapshot(error) {
	try {
		const descriptor = Object.getOwnPropertyDescriptor(error, "failure");
		return descriptor !== void 0 && "value" in descriptor ? failureSnapshot(descriptor.value) : void 0;
	} catch (_sdkPropertyTrap) {
		return;
	}
}
/** Validate and detach an arbitrary serializable failure payload. */
function failureSnapshot(value) {
	if (typeof value !== "object" || value === null) return void 0;
	try {
		const candidate = value;
		const message = candidate.message;
		const code = candidate.code;
		const status = candidate.status;
		const providerRetryAfterMs = candidate.providerRetryAfterMs;
		const requestId = candidate.requestId;
		if (typeof message !== "string" || message.length === 0 || typeof code !== "string" || code.length === 0 || status !== void 0 && (!Number.isInteger(status) || status < 100 || status > 599) || providerRetryAfterMs !== void 0 && (!Number.isFinite(providerRetryAfterMs) || providerRetryAfterMs <= 0) || requestId !== void 0 && (typeof requestId !== "string" || requestId.length === 0)) return void 0;
		return Object.freeze({
			message,
			code,
			...status === void 0 ? {} : { status },
			...providerRetryAfterMs === void 0 ? {} : { providerRetryAfterMs },
			...requestId === void 0 ? {} : { requestId }
		});
	} catch (_sdkFailureGetter) {
		return;
	}
}
/** Read an SDK error message without letting an accessor replace the primary failure. */
function errorMessage(error) {
	try {
		const message = error.message;
		if (typeof message === "string" && message.length > 0) return message;
	} catch (_sdkMessageGetter) {}
	return "LLM adapter failed";
}
/** Trust only Harness-owned codes; third-party SDK codes are not our taxonomy. */
function harnessErrorCode(error) {
	return error instanceof HarnessError ? error.code : "UNKNOWN";
}
function quoted(value) {
	return JSON.stringify(value);
}
/**
* Stable text shown to a model that cannot accept one durable image reference.
* @param ref - durable normalized attachment omitted from the request.
* @returns deterministic text-only placeholder.
*/
function textOnlyImageText(ref) {
	return `[image omitted because this model accepts text only; attachment sha256:${String(ref.attachmentId).slice(7, 15)}]`;
}
/**
* True when typed model content contains an image block, walking nested
* tool-result content. This is the one recursive image walk shared by every
* image policy (capability gating, text-only serialization, compaction
* survey), so a consumer cannot silently diverge on nesting depth.
* @param content - typed model content blocks.
* @returns whether any nested block is an image.
*/
function contentHasImage(content) {
	return content.some((block) => block.type === "image" || block.type === "tool-result" && contentHasImage(block.content));
}
/**
* True when typed model content contains a file block, walking nested
* tool-result content on the same recursion every file policy shares.
* Reads current content on every call without retaining scan results.
* @param content - typed model content blocks.
* @returns whether any nested block is a file.
*/
function contentHasFile(content) {
	for (const block of content) if (block.type === "file" || block.type === "tool-result" && contentHasFile(block.content)) return true;
	return false;
}
/**
* Stable model-facing handle for one durable file reference: the address of
* the verbatim stored copy and the instruction to read it on demand. This is
* the only representation a provider ever receives for a file.
* @param ref - durable verbatim file reference.
* @param readonlyPath - execution-world path of the stored copy, when resolvable.
* @returns deterministic handle text naming the file, its size, and its address.
*/
function fileHandleText(ref, readonlyPath) {
	const digest = String(ref.attachmentId).slice(7, 15);
	const identity = `File ${quoted(ref.name)} (${ref.bytes} bytes, sha256:${digest})`;
	if (readonlyPath === void 0) return `[${identity} was uploaded, but the current execution environment cannot access a readable path. Report that limitation if its contents are needed; do not claim to have read it.]`;
	return `[${identity}: verbatim read-only copy saved at ${quoted(readonlyPath)}. Read that path with your file tools when its contents are needed; copy it to a writable location before modifying it. When delegating file work, include this saved path in the delegation prompt; only subagents sharing this execution environment can read it.]`;
}
/** Replace every file occurrence, including nested tool results, with handle text. */
function replaceFilesWithHandles(blocks, resolvePath) {
	let next;
	for (const [index, block] of blocks.entries()) {
		if (block.type === "file") {
			next ??= blocks.slice(0, index);
			next.push({
				type: "text",
				text: fileHandleText(block.attachment, resolvePath(block.attachment))
			});
			continue;
		}
		if (block.type === "tool-result") {
			const content = replaceFilesWithHandles(block.content, resolvePath);
			if (content !== block.content) {
				next ??= blocks.slice(0, index);
				next.push({
					...block,
					content
				});
				continue;
			}
		}
		next?.push(block);
	}
	return next ?? blocks;
}
/**
* Project durable file history into deterministic handle text for every model
* route. Unlike images, no provider receives file blocks natively, so this
* projection is unconditional in request assembly.
* @param messages - complete request history.
* @param resolvePath - resolve one reference's current execution-world read path.
* @returns the original list without files, otherwise shallow message copies with handle text.
*/
function projectFilesToText(messages, resolvePath) {
	if (!messages.some((message) => contentHasFile(message.content))) return messages;
	return messages.map((message) => {
		const content = replaceFilesWithHandles(message.content, resolvePath);
		return content === message.content ? message : {
			...message,
			content
		};
	});
}
/** Replace every image occurrence, including nested tool results, for a text-only model. */
function replaceImagesForTextModel(blocks) {
	let next;
	for (const [index, block] of blocks.entries()) {
		if (block.type === "image") {
			next ??= blocks.slice(0, index);
			next.push({
				type: "text",
				text: textOnlyImageText(block.attachment)
			});
			continue;
		}
		if (block.type === "tool-result") {
			const content = replaceImagesForTextModel(block.content);
			if (content !== block.content) {
				next ??= blocks.slice(0, index);
				next.push({
					...block,
					content
				});
				continue;
			}
		}
		next?.push(block);
	}
	return next ?? blocks;
}
/**
* Project durable image history into deterministic text for an exact text-only model.
* @param messages - complete request history.
* @returns the original list without images, otherwise shallow message copies with stable placeholders.
*/
function projectImagesForTextModel(messages) {
	if (!messages.some((message) => contentHasImage(message.content))) return messages;
	return messages.map((message) => {
		const content = replaceImagesForTextModel(message.content);
		return content === message.content ? message : {
			...message,
			content
		};
	});
}
/**
* Centralize the non-secret product identity every provider request sends as `User-Agent`, keeping
* adapters from drifting. See
* `.agents/notes/implemented/architecture/2026-06-21-mandatory-app-attribution-headers.md`.
*
* App-attribution vocabulary for provider requests.
* @module @deepseek-ai/dsh-llm/attribution
*/
const { version } = createRequire(import.meta.url)("../package.json");
/**
* LLM service: adapter registry with a waterfall-interceptable streaming call
* API. Exports the `LlmRuntime` default, the abstract `LlmAdapter` for
* provider backends, and `BlockAssembler` for chunk assembly.
*
* @module @deepseek-ai/dsh-llm
*/
var __runInitializers = function(thisArg, initializers, value) {
	var useValue = arguments.length > 2;
	for (var i = 0; i < initializers.length; i++) value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
	return useValue ? value : void 0;
};
var __esDecorate = function(ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
	function accept(f) {
		if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected");
		return f;
	}
	var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
	var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
	var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
	var _, done = false;
	for (var i = decorators.length - 1; i >= 0; i--) {
		var context = {};
		for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
		for (var p in contextIn.access) context.access[p] = contextIn.access[p];
		context.addInitializer = function(f) {
			if (done) throw new TypeError("Cannot add initializers after decoration has completed");
			extraInitializers.push(accept(f || null));
		};
		var result = (0, decorators[i])(kind === "accessor" ? {
			get: descriptor.get,
			set: descriptor.set
		} : descriptor[key], context);
		if (kind === "accessor") {
			if (result === void 0) continue;
			if (result === null || typeof result !== "object") throw new TypeError("Object expected");
			if (_ = accept(result.get)) descriptor.get = _;
			if (_ = accept(result.set)) descriptor.set = _;
			if (_ = accept(result.init)) initializers.unshift(_);
		} else if (_ = accept(result)) if (kind === "field") initializers.unshift(_);
		else descriptor[key] = _;
	}
	if (target) Object.defineProperty(target, contextIn.name, descriptor);
	done = true;
};
/**
* Typed error for LLM-related failures. Extends {@link HarnessError}, so the
* `code` string (e.g. `AUTH`, `RATE_LIMIT`, `NO_ADAPTER`) is shared taxonomy.
*/
var LlmError = class extends HarnessError {
	/** Serializable facts retained beside this live Error. */
	failure;
	/**
	* @param message - non-empty human-readable failure summary.
	* @param code - non-empty stable provider-neutral machine code.
	* @param options - optional cause and validated serializable provider facts.
	*/
	constructor(message, code, options) {
		if (typeof message !== "string" || message.length === 0) throw new Error("LlmError message must be a non-empty string");
		if (typeof code !== "string" || code.length === 0) throw new Error("LlmError code must be a non-empty string");
		if (options?.status !== void 0 && (!Number.isInteger(options.status) || options.status < 100 || options.status > 599)) throw new Error("LlmError status must be an integer from 100 through 599");
		if (options?.providerRetryAfterMs !== void 0 && (!Number.isFinite(options.providerRetryAfterMs) || options.providerRetryAfterMs <= 0)) throw new Error("LlmError providerRetryAfterMs must be a positive finite number");
		if (options?.requestId !== void 0 && (typeof options.requestId !== "string" || options.requestId.length === 0)) throw new Error("LlmError requestId must be a non-empty string");
		super(message, code, options);
		this.name = "LlmError";
		this.failure = Object.freeze({
			message,
			code,
			...options?.status === void 0 ? {} : { status: options.status },
			...options?.providerRetryAfterMs === void 0 ? {} : { providerRetryAfterMs: options.providerRetryAfterMs },
			...options?.requestId === void 0 ? {} : { requestId: options.requestId }
		});
	}
};
(() => {
	let _classSuper = TypertRemoteService;
	let _instanceExtraInitializers = [];
	let _listProviders_decorators;
	let _listConfigurableProviders_decorators;
	let _remoteDiscoverModels_decorators;
	return class LlmRuntime extends _classSuper {
		static {
			const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
			_listProviders_decorators = [Remote];
			_listConfigurableProviders_decorators = [Remote];
			_remoteDiscoverModels_decorators = [Remote("discoverModels")];
			__esDecorate(this, null, _listProviders_decorators, {
				kind: "method",
				name: "listProviders",
				static: false,
				private: false,
				access: {
					has: (obj) => "listProviders" in obj,
					get: (obj) => obj.listProviders
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _listConfigurableProviders_decorators, {
				kind: "method",
				name: "listConfigurableProviders",
				static: false,
				private: false,
				access: {
					has: (obj) => "listConfigurableProviders" in obj,
					get: (obj) => obj.listConfigurableProviders
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _remoteDiscoverModels_decorators, {
				kind: "method",
				name: "remoteDiscoverModels",
				static: false,
				private: false,
				access: {
					has: (obj) => "remoteDiscoverModels" in obj,
					get: (obj) => obj.remoteDiscoverModels
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			if (_metadata) Object.defineProperty(this, Symbol.metadata, {
				enumerable: true,
				configurable: true,
				writable: true,
				value: _metadata
			});
		}
		adapters = (__runInitializers(this, _instanceExtraInitializers), /* @__PURE__ */ new Map());
		directory = /* @__PURE__ */ new Map();
		discoveries = /* @__PURE__ */ new Map();
		constructor(ctx) {
			super(ctx, "llm");
		}
		/** Notify topology observers without letting one broken listener veto the commit. */
		emitAdaptersUpdated() {
			let invariantFailure;
			for (const listener of this.ctx.events.dispatch("emit", ["llm/adapters-updated"])) try {
				const returned = listener();
				if (returned != null && typeof returned.then === "function") Promise.resolve(returned).then(void 0, (error) => {
					this.warnAdaptersListenerFailure(error);
				});
			} catch (error) {
				if (error?.code === "INVARIANT") {
					invariantFailure ??= error;
					continue;
				}
				this.warnAdaptersListenerFailure(error);
			}
			if (invariantFailure !== void 0) throw invariantFailure;
		}
		/** Contained-listener diagnostic shared by the sync and async failure paths. */
		warnAdaptersListenerFailure(error) {
			this.ctx.logger.warn("llm: an llm/adapters-updated listener failed");
			this.ctx.logger.warn(error);
		}
		/**
		* Register an adapter for the given provider routes. Throws `LlmError` with code
		* `DUPLICATE_ADAPTER` if any provider already has an adapter (all-or-nothing).
		* Disposed with the fiber.
		* @param providers - every provider route this adapter should serve.
		* @param adapter - the adapter that streams calls for those providers.
		* @returns the disposer, carrying {@link AdapterRegistrationHandle.replace}.
		*/
		registerAdapter(providers, adapter) {
			const owned = /* @__PURE__ */ new Set();
			let released = false;
			const dispose = this.ctx.effect(function* () {
				if (providers.length === 0) throw new LlmError("an adapter must register at least one provider", "INVALID_ADAPTER");
				this.commitRoutes(owned, this.prepareRoutes(providers, adapter, owned));
				yield () => {
					released = true;
					for (const provider of owned) this.adapters.delete(provider);
					owned.clear();
					this.emitAdaptersUpdated();
				};
			}.bind(this), "llm.registerAdapter()");
			const handle = (() => void dispose());
			handle.replace = (next) => {
				if (released) throw new LlmError("a disposed adapter registration cannot replace its routes", "REGISTRATION_DISPOSED");
				this.commitRoutes(owned, this.prepareRoutes(next, adapter, owned));
			};
			return handle;
		}
		/**
		* Validate one candidate route set for `adapter`, treating routes this
		* registration already holds as available. Nothing is mutated: a rejected
		* candidate leaves the registry exactly as it was.
		*/
		prepareRoutes(providers, adapter, owned) {
			const unique = /* @__PURE__ */ new Set();
			const registrations = [];
			for (const provider of providers) {
				if (provider.length === 0) throw new LlmError("adapter provider names must be non-empty", "INVALID_ADAPTER");
				if (unique.has(provider) || this.adapters.has(provider) && !owned.has(provider)) throw new LlmError(`an adapter for provider "${provider}" is already registered`, "DUPLICATE_ADAPTER");
				const info = adapter.providerInfo(provider);
				if (typeof info.id !== "string" || info.id !== provider || typeof info.name !== "string" || info.name.length === 0) throw new LlmError(`adapter metadata for provider "${provider}" must preserve its id and have a non-empty name`, "INVALID_ADAPTER");
				unique.add(provider);
				const retryPolicy = adapter.providerRetryPolicy(provider) ?? resolveRetryPolicy(void 0, `llm: provider "${provider}" retryPolicy`);
				registrations.push({
					adapter,
					provider: {
						id: info.id,
						name: info.name
					},
					retryPolicy
				});
			}
			return registrations;
		}
		/**
		* Swap this registration's routes for the prepared ones in one synchronous
		* section, so no observer can see the registry between the release and the
		* re-registration. The route set's one mutation point is also where
		* `llm/adapters-updated` is published, so a `replace` announces itself
		* exactly like a first registration.
		*/
		commitRoutes(owned, registrations) {
			for (const provider of owned) this.adapters.delete(provider);
			owned.clear();
			for (const registration of registrations) {
				this.adapters.set(registration.provider.id, registration);
				owned.add(registration.provider.id);
			}
			this.emitAdaptersUpdated();
		}
		/**
		* Describe provider routes with a registered adapter.
		* @returns detached provider metadata in registration order.
		*/
		listProviders() {
			return [...this.adapters.values()].map(({ provider }) => ({ ...provider }));
		}
		/**
		* Declare provider routes an adapter plugin can activate through
		* configuration. Registration is all-or-nothing: an empty list, invalid
		* entry, or a provider already declared by any registration throws
		* `LlmError` without registering the rest. Disposed with the fiber.
		* @param entries - every configurable provider this plugin owns.
		* @returns a handle that withdraws all of them, and can atomically replace them.
		*/
		registerConfigurableProviders(entries) {
			let held = [];
			let disposed = false;
			/**
			* Validate a candidate set in full against everything this registration
			* does not already hold, then publish it. Nothing is written until the
			* whole set passes, so a refused candidate leaves the current entries in
			* place — the property that makes `replace` a swap rather than a
			* delete-then-add that can strand the directory empty.
			*/
			const commit = (candidates) => {
				const detached = [];
				const own = new Set(held.map((entry) => entry.provider));
				for (const entry of candidates) {
					if (entry.provider.length === 0 || entry.displayName.length === 0 || entry.settingsNs.length === 0) throw new LlmError("configurable providers need a non-empty provider, displayName, and settingsNs", "INVALID_DIRECTORY");
					if (entry.settingsPath.some((segment) => segment.length === 0)) throw new LlmError(`configurable provider "${entry.provider}" has an empty settingsPath segment`, "INVALID_DIRECTORY");
					if (this.directory.has(entry.provider) && !own.has(entry.provider) || detached.some((seen) => seen.provider === entry.provider)) throw new LlmError(`configurable provider "${entry.provider}" is already declared`, "DUPLICATE_DIRECTORY");
					detached.push({
						...entry,
						settingsPath: [...entry.settingsPath]
					});
				}
				for (const entry of held) this.directory.delete(entry.provider);
				for (const entry of detached) this.directory.set(entry.provider, entry);
				held = detached;
				this.emitAdaptersUpdated();
			};
			const dispose = this.ctx.effect(function* () {
				if (entries.length === 0) throw new LlmError("a configurable-provider registration must declare at least one provider", "INVALID_DIRECTORY");
				commit(entries);
				yield () => {
					disposed = true;
					for (const entry of held) this.directory.delete(entry.provider);
					held = [];
					this.emitAdaptersUpdated();
				};
			}.bind(this), "llm.registerConfigurableProviders()");
			const handle = (() => void dispose());
			handle.replace = (next) => {
				if (disposed) throw new LlmError("this configurable-provider registration was disposed", "REGISTRATION_DISPOSED");
				commit(next);
			};
			return handle;
		}
		/**
		* List every declared configurable provider, registered or dormant.
		* @returns detached directory entries in declaration order.
		*/
		listConfigurableProviders() {
			return [...this.directory.values()].map((entry) => ({
				...entry,
				settingsPath: [...entry.settingsPath]
			}));
		}
		/**
		* Offer to interrogate provider endpoints on behalf of the settings
		* namespace this plugin owns. The namespace is the key because that is what
		* a configuration surface already holds from the configurable-provider
		* directory, and because a provider being *added* has no route to name yet.
		* Disposed with the fiber.
		* @param settingsNs - the namespace whose profiles this discovery serves.
		* @param discover - interrogates one endpoint and must honor the supplied signal.
		* @returns the disposer that withdraws the offer.
		*/
		registerModelDiscovery(settingsNs, discover) {
			const dispose = this.ctx.effect(function* () {
				if (settingsNs.length === 0) throw new LlmError("model discovery needs a non-empty settings namespace", "INVALID_DISCOVERY");
				if (this.discoveries.has(settingsNs)) throw new LlmError(`model discovery for "${settingsNs}" is already registered`, "DUPLICATE_DISCOVERY");
				this.discoveries.set(settingsNs, discover);
				yield () => {
					this.discoveries.delete(settingsNs);
				};
			}.bind(this), "llm.registerModelDiscovery()");
			return () => void dispose();
		}
		/**
		* Interrogate one provider endpoint for the models it advertises. The
		* request describes a draft, not a stored route, so nothing here reads or
		* writes settings or credentials — the caller owns both, and the reply is
		* candidate metadata a surface may offer for adoption.
		* @param settingsNs - namespace whose registered discovery serves this draft.
		* @param request - the endpoint, protocol, and one-shot credential to use.
		* @param signal - caller cancellation.
		* @returns the advertised models, deduplicated in endpoint order.
		*/
		async discoverModels(settingsNs, request, signal) {
			const discover = this.discoveries.get(settingsNs);
			if (discover === void 0) throw new LlmError(`no model discovery is registered for "${settingsNs}"`, "NO_DISCOVERY");
			if ((request.provider ?? "").length === 0 && (request.baseURL ?? "").length === 0) throw new LlmError("model discovery needs a provider route or a baseURL", "INVALID_DISCOVERY");
			const discovered = signal === void 0 ? await discover(request) : await discover(request, signal);
			const seen = /* @__PURE__ */ new Set();
			const models = [];
			for (const model of discovered) {
				if (typeof model.id !== "string" || model.id.length === 0 || seen.has(model.id)) continue;
				seen.add(model.id);
				models.push({
					id: model.id,
					...model.name === void 0 ? {} : { name: model.name },
					...model.contextWindow === void 0 ? {} : { contextWindow: model.contextWindow },
					...model.maxTokens === void 0 ? {} : { maxTokens: model.maxTokens }
				});
			}
			return models;
		}
		/**
		* Remote adapter for one draft provider interrogation.
		* @param settingsNs - namespace whose registered discovery serves this draft.
		* @param request - endpoint, protocol, and one-shot credential to use.
		* @param signal - caller cancellation supplied by the Remote carrier.
		* @returns advertised models in endpoint order.
		* @throws RemoteError with `llm/model-discovery-rejected` when discovery refuses or fails.
		*/
		async remoteDiscoverModels(settingsNs, request, signal) {
			try {
				return await this.discoverModels(settingsNs, request, signal);
			} catch (error) {
				throw new RemoteError("llm/model-discovery-rejected", error instanceof Error ? error.message : String(error), {
					settingsNs,
					...request.baseURL === void 0 ? {} : { baseURL: request.baseURL }
				}, { cause: error });
			}
		}
		/**
		* Resolve the retry policy captured when one provider route was registered.
		* @param provider - registered provider route to inspect.
		* @returns the provider-owned policy, with normal defaults already resolved.
		*/
		providerRetryPolicy(provider) {
			return this.registration(provider).retryPolicy;
		}
		/**
		* Resolve provider-side request-image pricing for one exact route, or
		* `undefined` when the provider is unregistered or declares none. Unknown
		* providers degrade to `undefined` rather than throwing because callers
		* price durable history whose route may no longer be mounted.
		* @param provider - provider route named by a request header.
		* @param model - exact model id named by the same header.
		* @returns the owning adapter's image pricing for the route, when declared.
		*/
		imageRequestPricing(provider, model) {
			return this.adapters.get(provider)?.adapter.imageRequestPricing(provider, model);
		}
		/**
		* Resolve the exact text one durable file occurrence contributes to every
		* provider request in the current execution environment.
		* @param ref - durable verbatim file reference from model history.
		* @returns the same deterministic handle text used at adapter dispatch.
		*/
		fileRequestText(ref) {
			return fileHandleText(ref, this.fileReadPath(ref));
		}
		/** Detach typed adapter-owned modality metadata. */
		detachedModalities(modalities) {
			return modalities === void 0 ? void 0 : [...modalities];
		}
		/**
		* Discover models advertised by one registered provider. Catalog membership
		* is advisory and never changes routing or request validation.
		* @param provider - registered provider route to inspect.
		* @returns detached model metadata in adapter-preferred order.
		*/
		async listModels(provider) {
			const models = await this.registration(provider).adapter.listModels(provider);
			const seen = /* @__PURE__ */ new Set();
			return models.map((model) => {
				if (typeof model.provider !== "string" || model.provider !== provider || typeof model.id !== "string" || model.id.length === 0 || typeof model.name !== "string" || model.name.length === 0 || model.description !== void 0 && typeof model.description !== "string" || seen.has(model.id)) throw new LlmError(`adapter returned invalid or duplicate model metadata for provider "${provider}"`, "INVALID_CATALOG");
				seen.add(model.id);
				const inputModalities = this.detachedModalities(model.inputModalities);
				return {
					provider: model.provider,
					id: model.id,
					name: model.name,
					...model.description === void 0 ? {} : { description: model.description },
					...inputModalities === void 0 ? {} : { inputModalities }
				};
			});
		}
		/**
		* Resolve and validate all metadata from the adapter that owns one exact
		* route. The result is detached from adapter-owned objects; catalog
		* membership remains advisory and does not control request routing.
		* @param provider - registered provider route to inspect.
		* @param model - exact model id passed to the adapter.
		* @param signal - optional cancellation for adapter-owned asynchronous lookup.
		* @returns exact model identity plus available context and reasoning metadata.
		*/
		async resolveModelInfo(provider, model, signal) {
			return this.resolveModelInfoFor(this.registration(provider), model, signal);
		}
		async resolveModelInfoFor(registration, model, signal) {
			const resolved = await registration.adapter.resolveModel(registration.provider.id, model, signal);
			return this.normalizeModelInfo(registration, model, resolved);
		}
		/** Validate and detach one adapter-returned exact model result. */
		normalizeModelInfo(registration, model, resolved) {
			const provider = registration.provider.id;
			if (typeof resolved.provider !== "string" || resolved.provider !== provider || typeof resolved.id !== "string" || resolved.id !== model || typeof resolved.name !== "string" || resolved.name.length === 0 || resolved.description !== void 0 && typeof resolved.description !== "string") throw new LlmError(`adapter returned invalid exact model metadata for provider "${provider}" model "${model}"`, "INVALID_MODEL_INFO");
			const context = resolved.context;
			if (context !== void 0 && (!Number.isInteger(context.contextWindow) || context.contextWindow <= 0)) throw new LlmError(`adapter returned invalid context metadata for provider "${provider}" model "${model}"`, "INVALID_MODEL_CONTEXT");
			const inputModalities = this.detachedModalities(resolved.inputModalities);
			const systemPromptUpdate = resolved.systemPromptUpdate;
			if (systemPromptUpdate !== void 0 && systemPromptUpdate !== "in-history") throw new LlmError(`adapter returned invalid system prompt update mode for provider "${provider}" model "${model}"`, "INVALID_MODEL_INFO");
			const defaultMaxTokens = resolved.defaultMaxTokens;
			if (defaultMaxTokens !== void 0 && (!Number.isSafeInteger(defaultMaxTokens) || defaultMaxTokens <= 0)) throw new LlmError(`adapter returned invalid default maxTokens for provider "${provider}" model "${model}"`, "INVALID_MODEL_MAX_TOKENS");
			const info = {
				provider,
				id: model,
				name: resolved.name,
				...resolved.description === void 0 ? {} : { description: resolved.description },
				...inputModalities === void 0 ? {} : { inputModalities },
				...context === void 0 ? {} : { context: { contextWindow: context.contextWindow } },
				...defaultMaxTokens === void 0 ? {} : { defaultMaxTokens },
				...resolved.systemPromptUpdate === void 0 ? {} : { systemPromptUpdate: resolved.systemPromptUpdate }
			};
			const reasoning = resolved.reasoning;
			if (reasoning === void 0) return info;
			if (reasoning.efforts.length === 0) throw new LlmError(`adapter returned invalid reasoning metadata for provider "${provider}" model "${model}"`, "INVALID_MODEL_REASONING");
			const seen = /* @__PURE__ */ new Set();
			const efforts = reasoning.efforts.map((effort) => {
				if (typeof effort.id !== "string" || effort.id.length === 0 || typeof effort.name !== "string" || effort.name.length === 0 || effort.description !== void 0 && typeof effort.description !== "string" || seen.has(effort.id)) throw new LlmError(`adapter returned invalid or duplicate reasoning effort metadata for provider "${provider}" model "${model}"`, "INVALID_MODEL_REASONING");
				seen.add(effort.id);
				return {
					id: effort.id,
					name: effort.name,
					...effort.description === void 0 ? {} : { description: effort.description }
				};
			});
			if (reasoning.defaultEffort !== void 0 && !seen.has(reasoning.defaultEffort)) throw new LlmError(`adapter returned an unknown default reasoning effort for provider "${provider}" model "${model}"`, "INVALID_MODEL_REASONING");
			return {
				...info,
				reasoning: {
					efforts,
					...reasoning.defaultEffort === void 0 ? {} : { defaultEffort: reasoning.defaultEffort }
				}
			};
		}
		/**
		* Validate a conversation call config against its exact model capability and
		* materialize adapter-configured defaults. Unsupported explicit efforts
		* reject before provider I/O; no clamping or aliasing is performed. This
		* standalone query does not bind a later dispatch; use {@link prepareCall}
		* when logging and streaming must share one adapter registration.
		* @param config - provider/model route and optional request controls.
		* @param signal - optional cancellation for adapter-owned capability lookup.
		* @returns a detached config only when a default must be materialized.
		*/
		async resolveCallConfig(config, signal) {
			return (await this.resolveCallFor(this.registration(config.provider), config, signal)).config;
		}
		async resolveCallFor(registration, config, signal) {
			const info = await this.resolveModelInfoFor(registration, config.model, signal);
			return this.resolveCallWithInfo(config, info);
		}
		/** Validate request controls against one already-bound exact model result. */
		resolveCallWithInfo(config, info) {
			const defaulted = config.maxTokens === void 0 && info.defaultMaxTokens !== void 0 ? {
				...config,
				maxTokens: info.defaultMaxTokens
			} : config;
			const reasoning = info.reasoning;
			const requested = defaulted.reasoningEffort;
			let resolvedConfig = defaulted;
			if (reasoning === void 0) {
				if (requested !== void 0) throw new LlmError(`provider "${config.provider}" model "${config.model}" does not support reasoning effort "${requested}"`, "UNSUPPORTED_REASONING_EFFORT");
			} else {
				const effective = requested ?? reasoning.defaultEffort;
				if (effective !== void 0) {
					if (!reasoning.efforts.some((effort) => effort.id === effective)) throw new LlmError(`provider "${config.provider}" model "${config.model}" does not support reasoning effort "${effective}"`, "UNSUPPORTED_REASONING_EFFORT");
					if (requested !== effective) resolvedConfig = {
						...defaulted,
						reasoningEffort: effective
					};
				}
			}
			return {
				config: resolvedConfig,
				...info.context === void 0 ? {} : { context: info.context },
				modelInfo: info
			};
		}
		/**
		* Resolve one call under its current adapter registration. The returned
		* one-shot handle keeps that registration across header logging and dispatch,
		* so HMR cannot combine one adapter's capability result with another adapter.
		* @param config - provider/model route and optional request controls.
		* @param signal - optional cancellation for adapter-owned capability lookup.
		* @returns a prepared config and its registration-bound stream entry point.
		*/
		async prepareCall(config, signal) {
			const registration = this.registration(config.provider);
			const adapterCall = await registration.adapter.prepareCall(config.provider, config.model, signal);
			const modelInfo = this.normalizeModelInfo(registration, config.model, adapterCall.model);
			const resolved = this.resolveCallWithInfo(config, modelInfo);
			const resolvedConfig = deepFreeze(structuredClone(resolved.config));
			const context = resolved.context === void 0 ? void 0 : deepFreeze(structuredClone(resolved.context));
			const adapterDefaults = deepFreeze({
				...config.reasoningEffort === void 0 && resolvedConfig.reasoningEffort !== void 0 ? { reasoningEffort: true } : {},
				...config.maxTokens === void 0 && resolvedConfig.maxTokens !== void 0 ? { maxTokens: true } : {}
			});
			let dispatched = false;
			return Object.freeze({
				config: resolvedConfig,
				retryPolicy: registration.retryPolicy,
				adapterDefaults,
				...context === void 0 ? {} : { context },
				...modelInfo.inputModalities === void 0 ? {} : { inputModalities: Object.freeze([...modelInfo.inputModalities]) },
				...modelInfo.systemPromptUpdate === void 0 ? {} : { systemPromptUpdate: modelInfo.systemPromptUpdate },
				stream: (options) => {
					if (dispatched) throw new LlmError("a prepared LLM call can only be dispatched once", "INVALID_PREPARED_CALL");
					if (!callConfigEquals(options, resolvedConfig)) throw new LlmError("prepared LLM call config changed before adapter dispatch", "INVALID_PREPARED_CALL");
					dispatched = true;
					return this.streamWithRegistration(options, {
						registration,
						config: resolvedConfig,
						modelInfo,
						dispatch: (options) => adapterCall.stream(options)
					});
				}
			});
		}
		registration(provider) {
			const registration = this.adapters.get(provider);
			if (!registration) throw new LlmError(`no adapter registered for provider "${provider}"`, "NO_ADAPTER");
			return registration;
		}
		/** Remove replay state whose historical route is owned by another adapter. */
		forAdapter(options, adapter) {
			const messages = options.messages.map((message) => {
				const source = message.source;
				if (message.role !== "assistant" || source.kind !== "model" || source.replayState === void 0) return message;
				if (this.adapters.get(source.provider)?.adapter === adapter) return message;
				return freezeMessage({
					...message,
					source: {
						kind: "model",
						provider: source.provider,
						model: source.model
					}
				});
			});
			if (messages.every((message, index) => message === options.messages[index])) return options;
			const filtered = {
				...options,
				messages
			};
			return Object.isFrozen(options) ? deepFreeze(filtered) : filtered;
		}
		/**
		* Resolve the current execution-world read path of one durable file
		* reference through the mounted attachment and filesystem providers.
		*/
		fileReadPath(ref) {
			let hostPath;
			try {
				hostPath = this.ctx.get("attachments")?.fileHostPath(ref);
			} catch {
				return;
			}
			if (hostPath === void 0) return void 0;
			return this.ctx.get("fs")?.processPathFromHostPath(hostPath);
		}
		/**
		* Final adapter boundary. Adapter selection, dispatch, iterator construction,
		* and iteration failures become one terminal failure chunk. Middleware and
		* downstream consumer failures remain thrown plugin or consumer errors.
		*/
		async *adapterStream(options, prepared) {
			let iterator;
			try {
				const registration = prepared?.registration ?? this.registration(options.provider);
				const adapter = registration.adapter;
				let modelInfo;
				let resolvedConfig;
				let dispatch;
				if (prepared === void 0) {
					const adapterCall = await adapter.prepareCall(options.provider, options.model, options.signal);
					modelInfo = this.normalizeModelInfo(registration, options.model, adapterCall.model);
					resolvedConfig = this.resolveCallWithInfo(options, modelInfo).config;
					dispatch = (options) => adapterCall.stream(options);
				} else {
					modelInfo = prepared.modelInfo;
					resolvedConfig = prepared.config;
					dispatch = prepared.dispatch;
				}
				if (prepared !== void 0 && !callConfigEquals(options, resolvedConfig)) throw new LlmError("prepared LLM call config changed before adapter dispatch", "INVALID_PREPARED_CALL");
				const resolvedOptions = callConfigEquals(options, resolvedConfig) ? options : Object.isFrozen(options) ? deepFreeze({
					...options,
					...resolvedConfig
				}) : {
					...options,
					...resolvedConfig
				};
				let projectedMessages = resolvedOptions.messages;
				if (projectedMessages.some((message) => contentHasFile(message.content))) projectedMessages = projectFilesToText(projectedMessages, (ref) => this.fileReadPath(ref));
				if (modelInfo.inputModalities !== void 0 && !modelInfo.inputModalities.includes("image") && projectedMessages.some((message) => contentHasImage(message.content))) projectedMessages = projectImagesForTextModel(projectedMessages);
				const projectedOptions = projectedMessages === resolvedOptions.messages ? resolvedOptions : Object.isFrozen(resolvedOptions) ? deepFreeze({
					...resolvedOptions,
					messages: projectedMessages
				}) : {
					...resolvedOptions,
					messages: projectedMessages
				};
				iterator = dispatch(this.forAdapter(projectedOptions, adapter))[Symbol.asyncIterator]();
			} catch (error) {
				yield adapterFailureChunk(error, options.signal);
				return;
			}
			let completed = false;
			try {
				while (true) {
					let item;
					try {
						const next = await iterator.next();
						item = next.done ? { done: true } : {
							done: false,
							value: next.value
						};
					} catch (error) {
						completed = true;
						yield adapterFailureChunk(error, options.signal);
						return;
					}
					if (item.done) {
						completed = true;
						return;
					}
					yield item.value;
				}
			} finally {
				if (!completed) {
					const close = iterator.return?.bind(iterator);
					if (close) await close();
				}
			}
		}
		/**
		* Stream one model call as raw chunks (token-level deltas). Replay state is
		* retained only when the same adapter instance owns its historical provider
		* and the target provider. Final adapter selection remains fixed through
		* asynchronous exact-model resolution and dispatch. Adapter selection,
		* dispatch, and iteration failures become terminal `error` or `aborted`
		* finish chunks; middleware, nested-call, cleanup, and consumer failures
		* remain thrown.
		* @param options - the full request; `options.provider` selects the adapter.
		* @returns the chunk stream, possibly wrapped by `llm/stream` listeners.
		*/
		stream(options) {
			return this.streamWithRegistration(options);
		}
		streamWithRegistration(options, prepared) {
			return this.ctx.waterfall(this, "llm/stream", options, () => this.adapterStream(options, prepared));
		}
	};
})();
/** Convert one adapter throw into the stream protocol's terminal outcome. */
function adapterFailureChunk(error, signal) {
	const failure = normalizeLlmFailure(error);
	return {
		type: "finish",
		reason: signal?.aborted || failure.code === "ABORTED" ? {
			kind: "aborted",
			failure
		} : {
			kind: "error",
			failure
		}
	};
}
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
					kind: "plugin",
					plugin: PLUGIN_NAME$1,
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
//#region ../../core/session/lib/index.js
/**
* Brand a string as a {@link SessionId}.
* @param id - the raw session id string.
* @returns the same string with the session-id brand.
*/
function SessionId(id) {
	return brandString(id);
}
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
function trustedLoopback(req) {
	const address = req.socket?.remoteAddress;
	if (address !== "127.0.0.1" && address !== "::1" && address !== "::ffff:127.0.0.1") return false;
	if (req.headers.forwarded !== void 0 || req.headers["x-forwarded-for"] !== void 0 || req.headers["x-real-ip"] !== void 0) return false;
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
	bestEffortWrite(flagPath(), String(Date.now()));
	bestEffortWrite(resumePath(), {
		sessionIds,
		restartAt: (/* @__PURE__ */ new Date()).toISOString(),
		pid: process.pid
	});
	const marker = markerPath(port);
	bestEffortWrite(marker, {
		from: INSTANCE_ID,
		oldPid: process.pid,
		port,
		requestedAt: (/* @__PURE__ */ new Date()).toISOString()
	});
	const helper = spawn(process.execPath, [HELPER_FILE, JSON.stringify({
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
		this.resumeDisposer = ctx.on("agent/created", ({ agent }) => this.deliver(agent));
		this.startResume();
	}
	mountRoutes() {
		this.routeDisposers.push(this.ctx.webServer.register({
			kind: "exact",
			path: "/dsh-restart/health",
			handler: (_req, res) => json(res, 200, {
				ok: true,
				instanceId: INSTANCE_ID,
				ts: Date.now()
			})
		}));
		this.routeDisposers.push(this.ctx.webServer.register({
			kind: "exact",
			path: "/dsh-restart/status",
			handler: (_req, res) => {
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
					kind: "plugin",
					plugin: PLUGIN_NAME,
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
const AUTO_CONTINUE_NS = "auto-continue";
const SETTINGS_NS = AUTO_CONTINUE_NS;
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
* Plugin body: register the settings namespace, start the single-instance
* engine, and serve the status bridge.
* @param ctx - host plugin context.
*/
function apply(ctx) {
	ctx.inject(["settings"], (settingsCtx) => {
		settingsCtx.settings.register(SETTINGS_NS, AutoContinueSchema, { applies: "live" });
	});
	let runnerRef;
	let restartRef;
	let toolDisposers = [];
	ctx.inject([
		"settings",
		"agents",
		"webServer",
		"tools"
	], (engineCtx) => {
		if (runnerRef !== void 0) runnerRef.dispose();
		restartRef?.dispose();
		for (const dispose of toolDisposers.splice(0)) dispose();
		const runner = new AutoContinueRunner(engineCtx, () => resolveConfig(engineCtx.settings.get(SETTINGS_NS)));
		runnerRef = runner;
		const restartController = new RestartController(engineCtx, () => resolveConfig(engineCtx.settings.get(SETTINGS_NS)));
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
			for (const send of sseClients) try {
				send(data);
			} catch {
				sseClients.delete(send);
			}
		};
		const statePayload = () => JSON.stringify({
			type: "state",
			stats: runner.todayStats(),
			paused: runner.activePauses()
		});
		runner.subscribeNotices(() => {
			for (const notice of runner.drainNotices()) pushToAll(`data: ${JSON.stringify({
				type: "notice",
				notice
			})}\n\n`);
		});
		runner.subscribeState(() => {
			pushToAll(`data: ${statePayload()}\n\n`);
		});
		engineCtx.webServer.register({
			kind: "exact",
			path: "/api/auto-continue-bridge",
			handler: (req, res) => {
				res.writeHead(200, {
					"content-type": "text/event-stream",
					"cache-control": "no-cache",
					connection: "keep-alive"
				});
				res.write(`data: ${statePayload()}\n\n`);
				const send = (data) => {
					res.write(data);
				};
				sseClients.add(send);
				req.on("close", () => sseClients.delete(send));
			}
		});
		engineCtx.webServer.register({
			kind: "exact",
			path: "/api/auto-continue-action",
			handler: (req, res) => {
				let body = "";
				req.on("data", (chunk) => {
					body += chunk.toString("utf8");
					if (body.length > 4096) req.destroy();
				});
				req.on("end", () => {
					try {
						const parsed = JSON.parse(body);
						if (typeof parsed.action === "string") {
							runner.handleNoticeAction(parsed.sessionId ?? void 0, parsed.action);
							res.writeHead(200, { "content-type": "application/json" });
							res.end(JSON.stringify({ ok: true }));
							return;
						}
						res.writeHead(400, { "content-type": "application/json" });
						res.end(JSON.stringify({ ok: false }));
					} catch {
						res.writeHead(400, { "content-type": "application/json" });
						res.end(JSON.stringify({ ok: false }));
					}
				});
			}
		});
	});
	ctx.effect(() => () => {
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
export { AUTO_CONTINUE_NS, AutoContinueSchema, apply };
