
export class WrappedGeneratorMethods<T, R = void, N = any> implements AsyncGenerator<T, R, N>{
    static count() {}
}

export type WrappedGenerator<T, R, N, M extends WrappedGeneratorMethods<T, R, N>> = {

};

export async function* wrapGen<T, R = void, N = any>(generator: AsyncGenerator<T, R, N>) {

}
