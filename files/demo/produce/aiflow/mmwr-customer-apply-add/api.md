# 新增申请列表 — 接口约定

## 服务缩写：`sale`  资源名：`customerApply`

### 1. 分页查询

- **方法**：POST  
- **URL**：`/sale/customerApply/addList`  
- **请求体**：`{ customerCode, approvalProduct, applyOrg, customerName, applyType, applyDept, applicant, approvalStatus, applyDateStart, applyDateEnd, verifyStatus, current, size }`  
- **响应**：`{ code:200, result:{ records:[], total, current, size } }`

### 2. 删除

- **方法**：POST  
- **URL**：`/sale/customerApply/remove`  
- **请求体**：`{ ids:[] }`

### 3. 提交审批

- **方法**：POST  
- **URL**：`/sale/customerApply/submit`  
- **请求体**：`{ ids:[] }`

### 4. 撤回

- **方法**：POST  
- **URL**：`/sale/customerApply/withdraw`  
- **请求体**：`{ ids:[] }`

### 5. 导出

- **方法**：GET  
- **URL**：`/sale/customerApply/export`

---

## 列表字段

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string | 主键 |
| applyCode | string | 申请编码（蓝色链接列） |
| applyType | string | 申请类型 |
| customerCode | string | 客户编码 |
| customerName | string | 客户名称 |
| approvalProduct | string | 审批产品别 |
| applyReason | string | 申请原因 |
| applicant | string | 申请人 |
| applyDept | string | 申请部门 |
| applyOrg | string | 申请组织 |
| creator | string | 创建人 |
| createTime | string | 创建时间 |
| approvalStatus | string | 审批状态（色块）|
| verifyStatus | string | 核实状态（色块）|
