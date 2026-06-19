import type { FormProfile } from '../types';

// Adult & Child Eval/Mgmt Exam (BMI screening). Shared sub-page across both the
// adult and child variants; fields not present on a given variant simply don't
// match and are reported as missed (harmless). Match by question label text.
const YN = ['Yes', 'No'];

export const BMI_EVAL: FormProfile = {
  id: 'BMI Eval',
  displayName: 'Adult/Child Eval/Mgmt Exam',
  detection: {
    anchors: ['Eval/Mgmt Exam', 'Body Mass Index Screening'],
    supporting: ['Body Mass Index', 'BMI'],
    categoryIds: [27096, 27097],
  },
  fields: [
    {
      key: 'bmiNotMeasuredReason',
      type: 'radio',
      labels: ['BMI Not Measured Reason'],
      options: ['Immobile', 'Measurement Device Capacity Exceeded', 'Refused'],
    },
    {
      key: 'bmiPopulation',
      type: 'radio',
      labels: ['BMI Population'],
      options: ['Adult - Age 18 or greater', 'Child / Adolescent - Age 3 - 17', 'Not Performed'],
    },
    {
      key: 'weightChange',
      type: 'radio',
      labels: ['Weight Change From Previous Visit'],
      options: ['Increased', 'Decreased', 'Same', 'N/A'],
    },
    { key: 'weightChangePounds', type: 'text', labels: ['Weight Change in Pounds'] },
    {
      key: 'bmiCalculationType',
      type: 'radio',
      labels: ['BMI Calculation Activities Type'],
      options: ['Actual', 'Reported'],
    },
    { key: 'adultCurrentBmi', type: 'text', labels: ['Adult Current Visit BMI'] },
    { key: 'childBmiPercentile', type: 'text', labels: ['Current Visit BMI Percentile'] },
    { key: 'bmiOutsideNormal', type: 'radio', labels: ['Is BMI outside normal parameters'], options: YN },
    { key: 'nutritionCounseling', type: 'radio', labels: ['Nutrition counseling provided'], options: YN },
    { key: 'exerciseCounseling', type: 'radio', labels: ['Exercise counseling provided'], options: YN },
    { key: 'weightMgmtEducation', type: 'radio', labels: ['Education for weight management provided'], options: YN },
    { key: 'dietarySupplements', type: 'radio', labels: ['Dietary supplements recommended'], options: YN },
    { key: 'medicationAdjustment', type: 'radio', labels: ['Medication adjustment'], options: YN },
    { key: 'referredToPcp', type: 'radio', labels: ['Referred to PCP for weight management'], options: YN },
    { key: 'bmiComments', type: 'textarea', labels: ['BMI Measurement Comments'] },
  ],
};
