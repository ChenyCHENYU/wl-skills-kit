# 临时客户档案 接口约定

> 服务: sale | 资源: tempCustomerArchive

## 1. 分页查询

```
POST /sale/tempCustomerArchive/list
```

### Request

| 字段                | 类型   | 必填 | 说明                              |
| ------------------- | ------ | ---- | --------------------------------- |
| customerName        | string |      | 客户名称（模糊）                  |
| tempCustomerCode    | string |      | 临时客户编号                      |
| customerCode        | string |      | 客户编码                          |
| customerStatus      | string |      | 客户状态(dict: customer_status)   |
| applicant           | string |      | 申请人                            |
| conversionStatus    | string |      | 转换状态(dict: conversion_status) |
| createDateStart     | string |      | 建立日期-起(YYYY-MM-DD)           |
| createDateEnd       | string |      | 建立日期-止(YYYY-MM-DD)           |
| lastFollowDateStart | string |      | 最后跟进-起(YYYY-MM-DD)           |
| lastFollowDateEnd   | string |      | 最后跟进-止(YYYY-MM-DD)           |
| current             | number | 是   | 当前页                            |
| size                | number | 是   | 每页条数                          |

### Response（35 列）

| 字段               | 类型   | 说明                                |
| ------------------ | ------ | ----------------------------------- |
| customerCode       | string | 客户编号                            |
| useOrg             | string | 使用组织                            |
| productLine        | string | 产品别(dict: product_line)          |
| applyReason        | string | 申请原因                            |
| salesPerson        | string | 业务员                              |
| salesDept          | string | 业务部门                            |
| verificationStatus | string | 核实状态(dict: verification_status) |
| createBy           | string | 创建人                              |
| createTime         | string | 创建时间                            |
| lastFollower       | string | 最近跟进人                          |
| lastFollowDate     | string | 最近跟进日期                        |
| contactName        | string | 联系人                              |
| contactPosition    | string | 职位                                |
| phone              | string | 手机号                              |
| companyPhone       | string | 公司电话                            |
| email              | string | E-mail                              |
| fax                | string | 传真                                |
| address            | string | 地址                                |
| receiverName       | string | 收货人                              |
| receiverPhone      | string | 收货联系方式                        |
| receiverAddress    | string | 收货地址                            |
| currency           | string | 币别                                |
| salesTaxRate       | string | 销项税率                            |
| bankAccountName    | string | 银行账户名称                        |
| bankType           | string | 银行类别                            |
| bankBranch         | string | 银行网点                            |
| bankAccount        | string | 银行账户                            |
| invoiceTitle       | string | 发票抬头                            |
| taxNo              | string | 税号                                |
| invoiceEmail       | string | 收票邮箱                            |
| invoicePhone       | string | 电话                                |
| invoiceAddress     | string | 收票地址                            |
| conversionStatus   | string | 转化状态(dict: conversion_status)   |
| customerStatus     | string | 客户状态(dict: customer_status)     |

---

## 2. 删除

```
DELETE /sale/tempCustomerArchive/remove?id={id}
```

## 3. 详情

```
GET /sale/tempCustomerArchive/getById?id={id}
```

## 4. 导出

```
GET /sale/tempCustomerArchive/export
```

## 5. 业务操作

```
POST /sale/tempCustomerArchive/assign     — 分配
POST /sale/tempCustomerArchive/reclaim    — 回收
POST /sale/tempCustomerArchive/convert    — 转化
POST /sale/tempCustomerArchive/claim      — 认领
POST /sale/tempCustomerArchive/returnBack — 退回
POST /sale/tempCustomerArchive/cancel     — 作废
```

Request: `{ ids: string[] }`
