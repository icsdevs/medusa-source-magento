import MagentoClientService, { PluginOptions } from './magento-client';
import {
  ProductCollection,
  TransactionBaseService,
  ProductCategoryService,
  ProductCategory,
} from '@medusajs/medusa';

import { EntityManager } from 'typeorm';

type InjectedDependencies = {
  magentoClientService: MagentoClientService;
  productCategoryService: ProductCategoryService;

  manager: EntityManager;
}

class MagentoCategoryService extends TransactionBaseService {
  declare protected manager_: EntityManager;
  declare protected transactionManager_: EntityManager;
  protected magentoClientService_: MagentoClientService;
  protected productCategoryService_: ProductCategoryService;

  constructor(container: InjectedDependencies, options: PluginOptions) {
    super(container);

    this.manager_ = container.manager;
    this.magentoClientService_ = container.magentoClientService;
    this.productCategoryService_ = container.productCategoryService;
  }

  async create (category: any): Promise<void> {
    return this.atomicPhase_(async (manager) => {
      const existingCategory = await this.productCategoryService_
          .withTransaction(manager)
          .retrieveByHandle(this.getHandle(category))
          .catch(() => undefined);

      if (existingCategory) {
        return this.update(category, existingCategory);
      }

      //create collection
      const categoryData = await this.normalizeCollection(category);

      await this.productCategoryService_
        .withTransaction(manager)
        .create(categoryData)
    })
  }

  async update (category: any, existingCollection: ProductCollection): Promise<void> {
    return this.atomicPhase_(async (manager) => {
      const collectionData = await this.normalizeCollection(category);

      const update = {}

      for (const key of Object.keys(collectionData)) {
        if (collectionData[key] !== existingCollection[key]) {
          update[key] = collectionData[key]
        }
      }

      if (Object.values(update).length) {
        await this.productCategoryService_
            .withTransaction(manager)
            .update(existingCollection.id, update)
      }
    })
  }

  async findParentCategoryId(magentoParentCategoryId: number) {
    const existingCategories = await this.productCategoryService_
        .withTransaction()
        .listAndCount({});

    console.log("EXISTING CATEGORYIES:", JSON.stringify(existingCategories));
  }

  async normalizeCollection(category: any): Promise<any> {
    if (category.parent_id) {
      await this.findParentCategoryId(category.parent_id);
    }

    return {
      name: category.name,
      handle: category.custom_attributes.find((attribute) => attribute.attribute_code === 'url_key')?.value,
      is_active: true,
      metadata: {
        magento_id: category.id
      }
    }
  }

  getHandle(category: any): string {
    return category.custom_attributes.find((attribute) => attribute.attribute_code === 'url_key')?.value || ''
  }
}

export default MagentoCategoryService;
