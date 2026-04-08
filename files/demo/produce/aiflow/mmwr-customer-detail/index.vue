<template>
  <div class="app-container temp-customer-detail" v-loading="loading">
    <!-- 标题栏 -->
    <div class="title-bar">
      <span class="customer-name">{{ form.customerName }}</span>
      <el-tag type="warning" effect="plain" size="small" class="status-tag">
        {{ form.convertStatus || "未转换" }}
      </el-tag>
    </div>

    <!-- 工具栏 -->
    <div class="page-toolbar">
      <el-button type="primary" @click="handleSave">保存</el-button>
      <el-button @click="handleTempSave">暂存</el-button>
      <el-button type="success" plain @click="handleConvert">转化</el-button>
      <el-button plain @click="handleAssign">分配</el-button>
      <el-button plain @click="handleClaim">认领</el-button>
      <el-button type="warning" @click="handleRecycle">回收</el-button>
      <el-button type="danger" plain @click="handleReturn">退回</el-button>
    </div>

    <el-form :model="form" label-position="top" class="detail-form">
      <!-- 头部信息网格 -->
      <div class="header-info">
        <el-row :gutter="12">
          <el-col :span="4">
            <el-form-item label="临时编号">
              <el-input v-model="form.tempCode" disabled />
            </el-form-item>
          </el-col>
          <el-col :span="4">
            <el-form-item label="正式编号">
              <el-input v-model="form.formalCode" disabled />
            </el-form-item>
          </el-col>
          <el-col :span="4">
            <el-form-item label="*使用组织">
              <el-select v-model="form.useOrg" placeholder="请选择" style="width:100%">
                <el-option v-for="o in OPTS.useOrg" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="4">
            <el-form-item label="*产品线">
              <el-select v-model="form.product" placeholder="请选择" style="width:100%">
                <el-option v-for="o in OPTS.product" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="4">
            <el-form-item label="最后跟进人">
              <el-input v-model="form.lastFollowPerson" disabled />
            </el-form-item>
          </el-col>
          <el-col :span="4">
            <el-form-item label="最后跟进时间">
              <el-date-picker v-model="form.lastFollowDate" type="date" placeholder="请选择"
                value-format="YYYY-MM-DD" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="4">
            <el-form-item label="创建人">
              <el-input v-model="form.creator" disabled />
            </el-form-item>
          </el-col>
          <el-col :span="4">
            <el-form-item label="创建时间">
              <el-input v-model="form.createTime" disabled />
            </el-form-item>
          </el-col>
        </el-row>
      </div>

      <!-- 基本信息 -->
      <div class="form-section">
        <div class="section-title">基本信息</div>
        <el-row :gutter="12">
          <el-col :span="16">
            <el-row :gutter="12">
              <el-col :span="14">
                <el-form-item label="*客户名称">
                  <div class="name-field">
                    <el-input v-model="form.customerName" placeholder="请输入客户名称" />
                    <span class="name-badge">CN</span>
                  </div>
                </el-form-item>
              </el-col>
              <el-col :span="5">
                <el-form-item label="*客户类型">
                  <el-select v-model="form.customerType" placeholder="请选择" style="width:100%">
                    <el-option v-for="o in OPTS.customerType" :key="o.value" :label="o.label" :value="o.value" />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :span="5">
                <el-form-item label="*客户等级">
                  <el-select v-model="form.customerLevel" placeholder="请选择" style="width:100%">
                    <el-option v-for="o in OPTS.customerLevel" :key="o.value" :label="o.label" :value="o.value" />
                  </el-select>
                </el-form-item>
              </el-col>
            </el-row>
          </el-col>
          <el-col :span="8">
            <el-form-item label="营业执照">
              <div class="upload-box">
                <div class="upload-placeholder">
                  <div class="upload-icon">+</div>
                  <div class="upload-text">点击/拖拽上传</div>
                </div>
              </div>
            </el-form-item>
          </el-col>
        </el-row>
      </div>

      <!-- 联系信息 -->
      <div class="form-section">
        <div class="section-title">联系信息</div>
        <el-row :gutter="12">
          <el-col :span="4">
            <el-form-item label="*联系人">
              <el-input v-model="form.contactPerson" placeholder="请输入" />
            </el-form-item>
          </el-col>
          <el-col :span="4">
            <el-form-item label="*手机号">
              <el-input v-model="form.contactPhone" placeholder="请输入" />
            </el-form-item>
          </el-col>
          <el-col :span="4">
            <el-form-item label="*公司电话">
              <el-input v-model="form.companyPhone1" placeholder="请输入" />
            </el-form-item>
          </el-col>
          <el-col :span="4">
            <el-form-item label="*公司电话">
              <el-input v-model="form.companyPhone2" placeholder="请输入" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="公司传真">
              <el-input v-model="form.companyFax" placeholder="请输入" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="4">
            <el-form-item label="*职位">
              <el-input v-model="form.position" placeholder="请输入" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="Email">
              <el-input v-model="form.email" placeholder="请输入" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="*地址">
              <el-input v-model="form.address" placeholder="请输入" />
            </el-form-item>
          </el-col>
        </el-row>
      </div>

      <!-- 送货信息 -->
      <div class="form-section">
        <div class="section-title">送货信息</div>
        <el-row :gutter="12">
          <el-col :span="4">
            <el-form-item label="收货人">
              <el-input v-model="form.consignee" placeholder="请输入" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="收货联系方式">
              <el-input v-model="form.deliveryContact" placeholder="请输入" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="收货地址">
              <el-input v-model="form.deliveryAddress" placeholder="请输入" />
            </el-form-item>
          </el-col>
        </el-row>
      </div>

      <!-- 银行信息 -->
      <div class="form-section">
        <div class="section-title">银行信息</div>
        <el-row :gutter="12">
          <el-col :span="4">
            <el-form-item label="币别">
              <el-select v-model="form.currency" style="width:100%">
                <el-option v-for="o in OPTS.currency" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="4">
            <el-form-item label="销项税率">
              <el-input v-model="form.taxRate" placeholder="--" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="8">
            <el-form-item label="银行类型">
              <el-input v-model="form.bankType" placeholder="请输入" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="银行账户名称">
              <el-input v-model="form.bankAccountName" placeholder="请输入" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="8">
            <el-form-item label="银行账户">
              <el-input v-model="form.bankAccount" placeholder="请输入" />
            </el-form-item>
          </el-col>
          <el-col :span="16">
            <el-form-item label="银行网点">
              <el-input v-model="form.bankBranch" placeholder="请输入" />
            </el-form-item>
          </el-col>
        </el-row>
      </div>

      <!-- 发票信息 -->
      <div class="form-section">
        <div class="section-title">发票信息</div>
        <el-row :gutter="12">
          <el-col :span="6">
            <el-form-item label="发票抬头">
              <el-input v-model="form.invoiceHeader" placeholder="请输入" />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="税号">
              <el-input v-model="form.taxNumber" placeholder="请输入" />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="收票邮箱">
              <el-input v-model="form.invoiceEmail" placeholder="请输入" />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="电话">
              <el-input v-model="form.invoicePhone" placeholder="请输入" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="收票地址">
              <el-input v-model="form.invoiceAddress" placeholder="请输入" />
            </el-form-item>
          </el-col>
        </el-row>
      </div>

      <!-- 跟进记录 -->
      <div class="form-section">
        <div class="section-title">跟进记录</div>
        <el-table :data="form.followRecords" border size="small">
          <el-table-column type="index" label="序号" width="55" align="center" />
          <el-table-column label="使用组织" prop="useOrg" min-width="120" />
          <el-table-column label="产品线" prop="product" width="80" />
          <el-table-column label="类型" prop="type" width="90" />
          <el-table-column label="活动日期" prop="activityDate" width="105" />
          <el-table-column label="活动单号" prop="activityCode" min-width="150" />
          <el-table-column label="活动标题" prop="activityTitle" min-width="150" />
          <el-table-column label="活动内容" prop="activityContent" min-width="100" />
          <el-table-column label="附件" prop="attachment" width="90">
            <template #default="{ row }">
              <a v-if="row.attachment" href="javascript:void(0)" class="link-text">{{ row.attachment }}</a>
            </template>
          </el-table-column>
          <el-table-column label="创建时间" prop="createTime" width="140" />
          <el-table-column label="操作" width="100" fixed="right">
            <template #default="{ $index }">
              <el-button type="primary" link size="small">编辑</el-button>
              <el-button type="danger" link size="small" @click="removeFollowRecord($index)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="add-row-btn" @click="addFollowRecord">+ 新增行</div>
      </div>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { useRoute } from "vue-router";
import { useTempCustomerDetail, OPTS } from "./data";

const route = useRoute();
const {
  loading, form,
  loadDetail, handleSave, handleTempSave,
  handleConvert, handleAssign, handleClaim, handleRecycle, handleReturn,
  addFollowRecord, removeFollowRecord
} = useTempCustomerDetail();

onMounted(() => {
  const id = route.query.id as string;
  if (id) loadDetail(id);
});
</script>

<style scoped lang="scss">
@import "./index.scss";
</style>
