# 客户详情 接口约定

> 服务: sale | 资源: customerArchive
> 页面类型: 多 Tab 只读详情页（7 基础 Tab + 企业核实 + 6 扩展 Tab）

## 1. 获取客户详情

```
GET /sale/customerArchive/getById?id={id}
```

Response 结构同 [customer-apply-change/api.md](../customer-apply-change/api.md)，
额外包含 `verificationInfo` 字段：

```json
{
  "verificationInfo": {
    "companyName": "string",
    "legalPerson": "string",
    "companyStatus": "string",
    "creditCode": "string",
    "registeredCapital": "string",
    "establishDate": "string",
    "companyType": "string",
    "region": "string",
    "registrationAuthority": "string",
    "businessScope": "string"
  }
}
```

## 2. 企业核实确认

```
POST /sale/customerArchive/verify
```

Request: `{ id: string }`

---

## 3. 扩展 Tab 列表接口

所有接口均为 `GET` 请求，参数 `customerId={id}`，返回 `data: Array`。

| Tab        | 接口路径                                  |
| ---------- | ----------------------------------------- |
| 不良记录   | `/sale/customerArchive/badRecord/list`    |
| 里程碑事件 | `/sale/customerArchive/milestone/list`    |
| 询单需求   | `/sale/customerArchive/inquiry/list`      |
| 跟进记录   | `/sale/customerArchive/followUp/list`     |
| 客诉记录   | `/sale/customerArchive/complaint/list`    |
| 历史销量   | `/sale/customerArchive/historySales/list` |

### 各接口 Response 字段

**不良记录**: contractNo, badType, badInfo, createDate, status

**里程碑事件**: recordDate, milestoneType(首次接触/首次询单/首次合同), detail

**询单需求**: steelType, size, price, quantity, remark, tradeCondition, paymentMethod

**跟进记录**: activityDate, activityNo, activityTitle, activityContent, createBy

**客诉记录**: complaintDate, complaintNo, complaintSubject, handleContent, handleDate, handleBy

**历史销量记录**: steelGrade, spec, unit, orderQty, orderAmount, outboundQty, outboundAmount, settlementQty, settlementAmount
