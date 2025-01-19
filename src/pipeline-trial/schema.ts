export type DiscriminateUnion<T, K extends keyof T, V extends T[K]> = Extract<T, Record<K, V>>;
export type DiscriminatedModel<T extends Record<K, T[K]>, K extends PropertyKey = "_T"> = { [V in T[K]]: DiscriminateUnion<T, K, V> };

// export const makeDiscriminatedModel = <T extends { [K: string]: T[keyof T]; }>(schema: T, options: { className?: string } = {}) => {
//     const C = {
//         ...(class { }),
//         name: options.className,
//         prototype: Object.defineProperties({}, Object.fromEntries(Object.entries(schema).map(([_T, V]) => ([ // TODO: Object.map() somewhere
//             [_T], { enumerable: true, writeable: false, get() {
                
//             } }
//         ])
//     };
// };