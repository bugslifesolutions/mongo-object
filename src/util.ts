/** Used as references for various `Number` constants. */
const MAX_SAFE_INTEGER = 9007199254740991

/**
 * @param doc Source object or array
 * @param isArray True if `doc` is an array
 * @param keepEmptyStrings Whether to keep empty strings
 * @returns An object in which all properties with null, undefined, or empty
 *   string values have been removed, recursively.
 */
export function cleanNulls (
  doc: Record<string, any>,
  isArray = false,
  keepEmptyStrings = false
): Record<string, any> | any[] {
  const newDoc = isArray ? [] : {}
  Object.keys(doc).forEach((key) => {
    let val = doc[key]
    if (!Array.isArray(val) && isBasicObject(val)) {
      val = cleanNulls(val, false, keepEmptyStrings) // Recurse into plain objects
      if (!isEmpty(val)) (newDoc as Record<string, any>)[key] = val
    } else if (Array.isArray(val)) {
      val = cleanNulls(val, true, keepEmptyStrings) // Recurse into non-typed arrays
      if (!isEmpty(val)) (newDoc as Record<string, any>)[key] = val
    } else if (!isNullUndefinedOrEmptyString(val)) {
      (newDoc as Record<string, any>)[key] = val
    } else if (
      keepEmptyStrings &&
      typeof val === 'string' &&
      val.length === 0
    ) {
      (newDoc as Record<string, any>)[key] = val
    }
  })
  return newDoc
}

/**
 * @param obj Any reference to check
 * @returns True if obj is an Object as opposed to
 *   something that inherits from Object
 */
export function isBasicObject (obj: any): boolean {
  return obj === Object(obj) && Object.getPrototypeOf(obj) === Object.prototype
}

/**
 * @method MongoObject.reportNulls
 * @public
 * @param flatDoc An object with no properties that are also objects.
 * @returns An object in which the keys represent the keys in the
 *   original object that were null, undefined, or empty strings, and the value
 *   of each key is "".
 */
export function reportNulls (
  flatDoc: Record<string, string | number | boolean | null | undefined>,
  keepEmptyStrings = false
): Record<string, string> {
  const nulls: Record<string, string> = {}

  // Loop through the flat doc
  Object.keys(flatDoc).forEach((key) => {
    const val = flatDoc[key]
    if (
      val === null ||
      val === undefined ||
      (!keepEmptyStrings && typeof val === 'string' && val.length === 0) ||
      // If value is an array in which all the values recursively are undefined, null,
      // or an empty string
      (Array.isArray(val) &&
        (cleanNulls(val, true, keepEmptyStrings) as any[]).length === 0)
    ) {
      nulls[key] = ''
    }
  })
  return nulls
}

export function appendAffectedKey (
  affectedKey: string | null | undefined,
  key: string
): string | null | undefined {
  if (key === '$each') return affectedKey
  return (affectedKey != null && affectedKey.length > 0) ? `${affectedKey}.${key}` : key
}

// Extracts operator piece, if present, from position string
export function extractOp (position: string): string | null {
  const firstPositionPiece = position.slice(0, position.indexOf('['))
  return firstPositionPiece.substring(0, 1) === '$' ? firstPositionPiece : null
}

export function genericKeyAffectsOtherGenericKey (
  key: string,
  affectedKey: string
): boolean {
  // If the affected key is the test key
  if (affectedKey === key) return true

  // If the affected key implies the test key because the affected key
  // starts with the test key followed by a period
  if (affectedKey.substring(0, key.length + 1) === `${key}.`) return true

  // If the affected key implies the test key because the affected key
  // starts with the test key and the test key ends with ".$"
  const lastTwo = key.slice(-2)
  if (lastTwo === '.$' && key.slice(0, -2) === affectedKey) return true

  return false
}

export function isNullUndefinedOrEmptyString (val: any): boolean {
  return (
    val === undefined ||
    val === null ||
    (typeof val === 'string' && val.length === 0)
  )
}

export function isLength (value: any): boolean {
  return (
    typeof value === 'number' &&
    value > -1 &&
    value % 1 === 0 &&
    value <= MAX_SAFE_INTEGER
  )
}

export function isArrayLike (value: any): boolean {
  return value != null &&
    typeof value === 'object' &&
    isFinite(value.length) &&
    value.length >= 0 &&
    value.length === Math.floor(value.length) &&
    value.length < Number.MAX_SAFE_INTEGER &&
    Object.keys(value).length - 1 === value.length
}

export function each (
  collection: any,
  iteratee: (item: any, keyOrIndex: number | string, obj: any) => boolean | undefined
): void {
  if (collection == null) {
    return
  }

  if (Array.isArray(collection)) {
    collection.forEach((val, index, iterable) => {
      iteratee(val, index.toString(), iterable)
    })
    return
  }

  const iterable = Object(collection)

  if (!isArrayLike(collection)) {
    Object.keys(iterable).forEach((key) => iteratee(iterable[key], key, iterable))
    return
  }

  let index = -1
  while (++index < collection.length) {
    if (iteratee(iterable[index], index.toString(), iterable) === false) {
      break
    }
  }
}

export function isPrototype (value: unknown): boolean {
  const Ctor = value?.constructor
  if (typeof Ctor !== 'function' || Ctor.prototype === undefined) {
    return value === Object.prototype
  }
  return value === Ctor.prototype
}

export function isEmpty (value: any): boolean {
  if (value === null || value === undefined) {
    return true
  }

  if (Array.isArray(value) || typeof value === 'string') {
    return value.length === 0
  }

  const tag = Object.prototype.toString.call(value)
  if (tag === '[object Map]' || tag === '[object Set]') {
    return value.size === 0
  }

  if (isPrototype(value)) {
    return Object.keys(value).length === 0
  }

  // eslint-disable-next-line no-restricted-syntax
  for (const key in value) {
    if (Object.hasOwnProperty.call(value, key)) {
      return false
    }
  }

  return true
}

export function isObject (value: any): boolean {
  const type = typeof value
  return value != null && (type === 'object' || type === 'function')
}

/* Takes a specific string that uses any mongo-style positional update
 * dot notation and returns a generic string equivalent. Replaces all numeric
 * positional "pieces" (e.g. '.1') or any other positional operator
 * (e.g. '$[<identifier>]')  with a dollar sign ($).
 *
 * @param key A specific or generic key
 * @returns Generic name.
 */
export function makeKeyGeneric (key: string): string | null {
  if (typeof key !== 'string') return null
  return key.replace(/\.([0-9]+|\$\[[^\]]*\])(?=\.|$)/g, '.$')
}

export function keyToPosition (key: string, wrapAll = false): string {
  let position = ''
  key.split('.').forEach((piece, i) => {
    if (i === 0 && !wrapAll) {
      position += piece
    } else {
      position += `[${piece}]`
    }
  })
  return position
}

/**
 *  Takes a string representation of an object key and its value
 *  and updates "obj" to contain that key with that value.
 *
 *  Example keys and results if val is 1:
 *    "a" -> {a: 1}
 *    "a[b]" -> {a: {b: 1}}
 *    "a[b][0]" -> {a: {b: [1]}}
 *    'a[b.0.c]' -> {a: {'b.0.c': 1}}
 * @param val Value
 * @param key Key
 * @param obj Object
 */
export function expandKey (val: any, key: string, obj: any): void {
  const subkeys = key.split('[')
  let current = obj
  for (let i = 0, ln = subkeys.length; i < ln; i++) {
    let subkey = subkeys[i]
    if (subkey.slice(-1) === ']') {
      subkey = subkey.slice(0, -1)
    }

    if (i === ln - 1) {
      // Last iteration; time to set the value; always overwrite
      current[subkey] = val

      // If val is undefined, delete the property
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      if (val === undefined) delete current[subkey]
    } else {
      // See if the next piece is a number
      const nextPiece = subkeys[i + 1]
      if (current[subkey] === undefined) {
        current[subkey] = Number.isNaN(parseInt(nextPiece, 10)) ? {} : []
      }
    }

    current = current[subkey]
  }
}
