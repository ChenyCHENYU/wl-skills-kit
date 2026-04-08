# 客户档案 接口约定

> 服务: sale | 资源: customerArchive

## 1. 分页查询

```
POST /sale/customerArchive/list
```

### Request

| 字段                | 类型   | 必填 | 说明                                |
| ------------------- | ------ | ---- | ----------------------------------- |
| customerCategory    | string | 是   | 客户分类: formal/temp/pool          |
| customerName        | string |      | 客户名称（模糊）                    |
| customerCode        | string |      | 客户编码                            |
| tempCustomerCode    | string |      | 临时客户编号                        |
| customerStatus      | string |      | 客户状态(dict: customer_status)     |
| applicant           | string |      | 申请人                              |
| conversionStatus    | string |      | 转换状态(dict: conversion_status)   |
| createDateStart     | string |      | 建立日期-起(YYYY-MM-DD)             |
| createDateEnd       | string |      | 建立日期-止(YYYY-MM-DD)             |
| lastFollowDateStart | string |      | 最后跟进-起(YYYY-MM-DD)             |
| lastFollowDateEnd   | string |      | 最后跟进-止(YYYY-MM-DD)             |
| productLine         | string |      | 产品别(dict: product_line)          |
| approvalStatus      | string |      | 审批状态(dict: approval_status)     |
| verificationStatus  | string |      | 核实状态(dict: verification_status) |
| enableStatus        | string |      | 启用状态(dict: enable_status)       |
| current             | number | 是   | 当前页                              |
| size                | number | 是   | 每页条数                            |

### Response

| 字段              | 类型   | 说明                            |
| ----------------- | ------ | ------------------------------- |
| customerName      | string | 客户名称                        |
| customerShortName | string | 客户简称                        |
| customerType      | string | 客户类型(dict: customer_type)   |
| countryRegion     | string | 国家/地区                       |
| tradeCurrency     | string | 交易币种                        |
| taxCategory       | string | 纳税类别(dict: tax_category)    |
| relationType      | string | 关系人分类(dict: relation_type) |
| parentCustomer    | string | 上级客户                        |
| groupName         | string | 集团                            |
| createBy          | string | 建立人                          |
| createTime        | string | 建立时间                        |
| applyOrg          | string | 申请组织                        |
| enableStatus      | string | 启用状态(dict: enable_status)   |
| disableTime       | string | 停用时间                        |

---

## 2. 删除

```
DELETE /sale/customerArchive/remove?id={id}
```

## 3. 详情

```
GET /sale/customerArchive/getById?id={id}
```

## 4. 导出

```
GET /sale/customerArchive/export
```

支持与分页查询相同的筛选参数。

---

## 字典表

| dictCode            | 值                                                        |
| ------------------- | --------------------------------------------------------- |
| customer_status     | 待定义                                                    |
| conversion_status   | 已转换 / 未转换                                           |
| product_line        | 热轧 / 盘元 / 冷精 / 汽车                                 |
| approval_status     | 开立审批中 / 审批完成 / 流程终止 / 驳回                   |
| verification_status | 已核实 / 未核实                                           |
| enable_status       | 已启用 / 已停用                                           |
| customer_type       | SYCSR001-交易客户 / SYCSR002-非交易客户                   |
| tax_category        | 一般纳税人 / 小规模纳税人 / 海外纳税 / 其他               |
| relation_type       | 01-关联企业 / 02-合并关系人 / 03-非关系人 / 04-实质关系人 |
