import {
  AbstractPageQueryHook,
  BaseQueryItemDesc,
  ActionButtonDesc,
  TableColumnDesc
} from "@/types/page";
import { RequestMethod } from "@jhlc/types/src/request-type";

export function createPage(
  listApi: string,
  constQueryParam: Record<string, any>,
  queryItemsConfig: BaseQueryItemDesc<any>[],
  columns: TableColumnDesc<any>[],
  requestMethod: RequestMethod
) {
  let Page = new (class extends AbstractPageQueryHook {
    constructor() {
      super({
        requestMethod: requestMethod,
        url: {
          list: listApi
        },
        constQueryParam: () => constQueryParam
      });
    }

    queryDef(): BaseQueryItemDesc<any>[] {
      return queryItemsConfig;
    }

    toolbarDef(): ActionButtonDesc[] {
      return [];
    }

    columnsDef(): TableColumnDesc<any>[] {
      return [{ type: "index", label: "序号", width: 60 }, ...columns];
    }
  })();

  return Page.create() as any;
}
