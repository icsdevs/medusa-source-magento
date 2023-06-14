import MagentoClientService, { PluginOptions } from './magento-client';
import {
  ProductCollection,
  TransactionBaseService,
  ProductCategoryService,
  ProductCategory,
} from '@medusajs/medusa';

import { EntityManager } from 'typeorm';
import * as console from "console";

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
      const categoryData = this.normalizeCollection(category);

      await this.productCategoryService_
        .withTransaction(manager)
        .create(categoryData)
    })
  }

  async update (category: any, existingCollection: ProductCollection): Promise<void> {
    return this.atomicPhase_(async (manager) => {
      const collectionData = this.normalizeCollection(category);

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

  async populateParentCategories(categories: any[]) {
    for (const cat of categories) {
      const ec = await this.productCategoryService_.retrieveByHandle(this.getHandle(cat));
      const update = this.normalizeCollection(cat);
      if (cat.parent_id) {
        const pc = categories.find(p => p.id === cat.parent_id);
        const epc = await this.productCategoryService_.retrieveByHandle(this.getHandle(pc));

        update.parent_category_id = epc.id;
      }

      this.productCategoryService_.update(ec.id, update);
    }
  }

  normalizeCollection(category: any) {
    return {
      name: category.name,
      handle: category.custom_attributes.find((attribute) => attribute.attribute_code === 'url_key')?.value,
      is_active: true,
      parent_category_id: null,
    }
  }

  getHandle(category: any): string {
    return category.custom_attributes.find((attribute) => attribute.attribute_code === 'url_key')?.value || ''
  }
}

export default MagentoCategoryService;
