export interface BatchExecutionResult<R> {
  batchesExecuted: number;
  totalProcessed: number;
  results: R[];
}

export async function processLayerItemsInBatches<T, R>(
  items: readonly T[],
  batchSize: number,
  processor: (batch: readonly T[], batchIndex: number) => R[] | Promise<R[]>
): Promise<BatchExecutionResult<R>> {
  const safeBatchSize = Math.max(1, Math.floor(batchSize));
  const results: R[] = [];
  let batchesExecuted = 0;

  for (let i = 0; i < items.length; i += safeBatchSize) {
    const slice = items.slice(i, i + safeBatchSize);
    const chunkRes = await processor(slice, batchesExecuted);
    results.push(...chunkRes);
    batchesExecuted += 1;
  }

  return {
    batchesExecuted,
    totalProcessed: items.length,
    results,
  };
}
