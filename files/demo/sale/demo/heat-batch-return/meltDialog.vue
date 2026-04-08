<template>
  <el-dialog
    v-model="dialogVisible"
    title="新增返送炉次"
    width="50%"
    :close-on-click-modal="false"
    align-center
    @close="handleClose"
  >
    <el-form
      ref="formRef"
      :model="formData"
      :rules="rules"
      label-width="90px"
      label-position="right"
    >
      <el-row :gutter="20">
        <el-col :span="6">
          <el-form-item label="PONO号" prop="ponoNumber">
            <el-input
              v-model="formData.ponoNumber"
              placeholder="请输入"
              size="small"
              style="width: 100%"
            />
          </el-form-item>
        </el-col>
      </el-row>
      <el-row :gutter="20">
        <el-col :span="6">
          <el-form-item label="连铸机号" prop="continuousCasterNumber" required>
            <el-select
              v-model="formData.continuousCasterNumber"
              placeholder="请选择"
              clearable
              size="small"
              style="width: 100%"
            >
              <el-option label="1" value="1" />
              <el-option label="2" value="2" />
              <el-option label="3" value="3" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="6">
          <el-form-item label="内部钢种" prop="internalSteelGrade" required>
            <el-input
              v-model="formData.internalSteelGrade"
              placeholder="请输入"
              size="small"
              style="width: 100%"
            />
          </el-form-item>
        </el-col>
        <el-col :span="6">
          <el-form-item label="铸坯类型" prop="castSlabType" required>
            <el-select
              v-model="formData.castSlabType"
              placeholder="请选择"
              clearable
              size="small"
              style="width: 100%"
            >
              <el-option label="类型1" value="type1" />
              <el-option label="类型2" value="type2" />
              <el-option label="类型3" value="type3" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="6">
          <el-form-item label="坯数" prop="slabCount" required>
            <el-input
              v-model="formData.slabCount"
              placeholder="请输入"
              size="small"
              style="width: 100%"
            />
          </el-form-item>
        </el-col>
      </el-row>

      <el-row :gutter="20">
        <el-col :span="6">
          <el-form-item label="厚度" prop="thickness" required>
            <el-input
              v-model="formData.thickness"
              placeholder="请输入"
              size="small"
              style="width: 100%"
            >
              <template #suffix>
                <span class="input-suffix">(mm)</span>
              </template>
            </el-input>
          </el-form-item>
        </el-col>
        <el-col :span="6">
          <el-form-item label="宽度(mm)" prop="width" required>
            <el-input
              v-model="formData.width"
              placeholder="请输入"
              size="small"
              style="width: 100%"
            >
              <template #suffix>
                <span class="input-suffix">(mm)</span>
              </template>
            </el-input>
          </el-form-item>
        </el-col>
        <el-col :span="6">
          <el-form-item label="长度(mm)" prop="length" required>
            <el-input
              v-model="formData.length"
              placeholder="请输入"
              size="small"
              style="width: 100%"
            >
              <template #suffix>
                <span class="input-suffix">(mm)</span>
              </template>
            </el-input>
          </el-form-item>
        </el-col>
        <el-col :span="6">
          <el-form-item label="长度上限" prop="lengthUpperLimit" required>
            <el-input
              v-model="formData.lengthUpperLimit"
              placeholder="请输入"
              size="small"
              style="width: 100%"
            >
              <template #suffix>
                <span class="input-suffix">(mm)</span>
              </template>
            </el-input>
          </el-form-item>
        </el-col>
      </el-row>

      <el-row :gutter="20">
        <el-col :span="6">
          <el-form-item label="宽度上限" prop="widthUpperLimit" required>
            <el-input
              v-model="formData.widthUpperLimit"
              placeholder="请输入"
              size="small"
              style="width: 100%"
            >
              <template #suffix>
                <span class="input-suffix">(mm)</span>
              </template>
            </el-input>
          </el-form-item>
        </el-col>
      </el-row>
    </el-form>

    <template #footer>
      <div class="dialog-footer">
        <el-button size="small" @click="handleClose">取消</el-button>
        <el-button type="primary" size="small" @click="handleConfirm">确认</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';

const dialogVisible = ref(false);
const formRef = ref<FormInstance>();

// 打开弹窗方法
const open = () => {
  dialogVisible.value = true;
};

// 关闭弹窗方法
const close = () => {
  handleClose();
};

// 暴露方法供外部调用
defineExpose({
  open,
  close,
});

// 表单数据
const formData = reactive({
  ponoNumber: '',
  internalSteelGrade: '',
  castSlabType: '',
  slabCount: '',
  continuousCasterNumber: '1',
  width: '',
  length: '',
  lengthUpperLimit: '',
  thickness: '',
  widthUpperLimit: '',
});

// 表单校验规则
const rules = reactive<FormRules>({
  internalSteelGrade: [{ required: true, message: '请输入内部钢种', trigger: 'blur' }],
  castSlabType: [{ required: true, message: '请选择铸坯类型', trigger: 'change' }],
  slabCount: [
    { required: true, message: '请输入坯数', trigger: 'blur' },
    { pattern: /^\d+$/, message: '坯数必须为数字', trigger: 'blur' },
  ],
  continuousCasterNumber: [{ required: true, message: '请选择连铸机号', trigger: 'change' }],
  width: [
    { required: true, message: '请输入宽度', trigger: 'blur' },
    { pattern: /^\d+(\.\d+)?$/, message: '宽度必须为数字', trigger: 'blur' },
  ],
  length: [
    { required: true, message: '请输入长度', trigger: 'blur' },
    { pattern: /^\d+(\.\d+)?$/, message: '长度必须为数字', trigger: 'blur' },
  ],
  lengthUpperLimit: [
    { required: true, message: '请输入长度上限', trigger: 'blur' },
    { pattern: /^\d+(\.\d+)?$/, message: '长度上限必须为数字', trigger: 'blur' },
  ],
  thickness: [
    { required: true, message: '请输入厚度', trigger: 'blur' },
    { pattern: /^\d+(\.\d+)?$/, message: '厚度必须为数字', trigger: 'blur' },
  ],
  widthUpperLimit: [
    { required: true, message: '请输入宽度上限', trigger: 'blur' },
    { pattern: /^\d+(\.\d+)?$/, message: '宽度上限必须为数字', trigger: 'blur' },
  ],
});

// 关闭弹窗
const handleClose = () => {
  dialogVisible.value = false;
  formRef.value?.resetFields();
  // 重置表单数据
  Object.assign(formData, {
    ponoNumber: '',
    internalSteelGrade: '',
    castSlabType: '',
    slabCount: '',
    continuousCasterNumber: '1',
    width: '',
    length: '',
    lengthUpperLimit: '',
    thickness: '',
    widthUpperLimit: '',
  });
};

// 确认提交
const handleConfirm = async () => {
  if (!formRef.value) return;

  try {
    await formRef.value.validate();
    ElMessage.success('提交成功');
    handleClose();
    // 这里可以调用提交接口
    console.log('表单数据:', formData);
  } catch (error) {
    console.error('表单校验失败:', error);
  }
};
</script>

<style scoped lang="scss">
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.input-suffix {
  color: #909399;
  font-size: 12px;
  padding-right: 0px;
}

// 确保所有输入框和下拉框宽度一致
:deep(.el-form-item) {
  margin-bottom: 18px;
}

:deep(.el-input),
:deep(.el-select) {
  width: 100%;
}

// 覆盖primary按钮颜色
:deep(.el-button--primary:not(.el-button--text):not(.is-link)) {
  background-color: #002a8f;
  border-color: #002a8f;
  color: #fff;

  &:hover,
  &:focus {
    background-color: #0033b3;
    border-color: #0033b3;
    color: #fff;
  }

  &:active {
    background-color: #002080;
    border-color: #002080;
    color: #fff;
  }
}

// 必填项标签样式
:deep(.el-form-item.is-required .el-form-item__label::before) {
  content: '*';
  color: #f56c6c;
  margin-right: 4px;
}
</style>
