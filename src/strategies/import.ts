import { AbstractBatchJobStrategy, BatchJob, BatchJobService, ProductVariantService, Store, StoreService } from '@medusajs/medusa'
import MagentoClientService, { MagentoProductTypes } from '../services/magento-client';

import { EntityManager } from 'typeorm'
import { Logger } from '@medusajs/medusa/dist/types/global';
import MagentoCategoryService from '../services/magento-category';
import MagentoProductService from '../services/magento-product';

type InjectedDependencies = {
  storeService: StoreService;
  magentoProductService: MagentoProductService;
  magentoClientService: MagentoClientService;
  magentoCategoryService: MagentoCategoryService;
  productVariantService: ProductVariantService;
  logger: Logger;
  manager: EntityManager;
  batchJobService: BatchJobService;
}

class ImportStrategy extends AbstractBatchJobStrategy {
  static identifier = 'import-magento-strategy'
  static batchType = 'import-magento'

  protected batchJobService_: BatchJobService
  protected storeService_: StoreService;
  protected magentoProductService_: MagentoProductService;
  protected magentoClientService_: MagentoClientService;
  protected magentoCategoryService_: MagentoCategoryService;
  protected productVariantService: ProductVariantService;
  protected logger_: Logger;

  constructor(container: InjectedDependencies) {
    super(container);

    this.manager_ = container.manager;
    this.storeService_ = container.storeService;
    this.magentoProductService_ = container.magentoProductService;
    this.magentoClientService_ = container.magentoClientService;
    this.magentoCategoryService_ = container.magentoCategoryService;
    this.productVariantService = container.productVariantService;
    this.logger_ = container.logger;
    this.batchJobService_ = container.batchJobService;
  }

  async preProcessBatchJob(batchJobId: string): Promise<void> {
    return await this.atomicPhase_(async (transactionManager) => {
      const batchJob = (await this.batchJobService_
        .withTransaction(transactionManager)
        .retrieve(batchJobId))

      await this.batchJobService_
        .withTransaction(transactionManager)
        .update(batchJob, {
          result: {
            progress: 0
          }
        })
    })
  }

  async processJob(batchJobId: string): Promise<void> {
    const batchJob = (await this.batchJobService_
      .retrieve(batchJobId))

    let store: Store

    try {
      store = await this.storeService_.retrieve();
    } catch (e) {
      this.logger_.info('Skipping Magento import since no store is created in Medusa.');
      return;
    }

    const lastUpdatedTime = await this.getBuildTime(store)

    // retrieve categories
    this.logger_.info('Importing categories from Magento...');
    const { data } = await this.magentoClientService_.retrieveCategories(lastUpdatedTime);
    data.items.map(async (category) => {
      return this.magentoCategoryService_.create(category);
    })

    if (data.items.length) {
      this.logger_.info(`${data.items.length} categories have been imported or updated successfully.`)
    } else {
      this.logger_.info(`No categories have been imported or updated.`)
    }

    // retrieve custom field data
    this.logger_.info("Fetching custom attribute data...");
    const attributeData = {};
    for (const field of this.magentoClientService_.getCustomFields()) {
      this.logger_.info(`Fetching custom field ${field}`);
      attributeData[field] = await this.magentoClientService_.getAttribute(field);
    }

    // retrieve configurable products
    this.logger_.info('Importing configurable products from Magento...');
    const products = await this.magentoClientService_.retrieveProducts(MagentoProductTypes.CONFIGURABLE, lastUpdatedTime);
    this.logger_.info("All configurable products successfully retrieved");
    for (let product of products) {
      try {
        await this.magentoProductService_.create(product, attributeData);
      } catch (error) {
        this.logger_.error("Error creating configurable product", error);
      }
    }

    // retrieve simple products to insert those that don't belong to a configurable product
    this.logger_.info('Importing simple products from Magento...');
    const simpleProducts = await this.magentoClientService_.retrieveProducts(MagentoProductTypes.SIMPLE, lastUpdatedTime);
    this.logger_.info("All simple products successfully retrieved");
    for (let product of simpleProducts) {
      try {
        await this.magentoProductService_.create(product, attributeData);
      } catch (error) {
        this.logger_.error("Error creating simple product", error);
      }
    }

    if (products.length || simpleProducts.length) {
      this.logger_.info(`${products.length + simpleProducts.length} products have been imported or updated successfully.`)
    } else {
      this.logger_.info(`No products have been imported or updated.`)
    }

    await this.updateBuildTime(store);
  }

  async getBuildTime(store?: Store|null): Promise<string|null> {
    let buildtime = null

    try {
      if (!store) {
        store = await this.storeService_.retrieve()
      }
    } catch {
      return null
    }

    if (store.metadata?.source_magento_bt) {
      buildtime = store.metadata.source_magento_bt
    }

    if (!buildtime) {
      return null
    }

    return buildtime
  }

  async updateBuildTime (store?: Store|null): Promise<void> {
    try {
      if (!store) {
        store = await this.storeService_.retrieve()
      }
    } catch {
      return null
    }

    const payload = {
      metadata: {
        source_magento_bt: new Date().toISOString(),
      },
    }

    await this.storeService_.update(payload)
  }

  protected async shouldRetryOnProcessingError(batchJob: BatchJob, err: unknown): Promise<boolean> {
    return true
  }

  buildTemplate(): Promise<string> {
    throw new Error('Method not implemented.')
  }
  declare protected manager_: EntityManager
  declare protected transactionManager_: EntityManager

}

export default ImportStrategy
