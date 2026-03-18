/**
 * @module savings
 * Barrel re-export for the Savings Engine.
 *
 * All 62+ exported functions are available from this single entry point.
 * Internal module structure:
 *   core.js         - Constants, parseSavingRange, timelineBucket, formatCurrency, getAccessiblePortfolios
 *   spending.js     - matchSpendingToPortfolio, spendingBudgetVariance, spendingConcentration
 *   directives.js   - mapFindingsToPortfolio, aggregateSavings, generateDirectives, generateAllDirectives
 *   playbook.js     - generateReformPlaybook, mtfsComparison
 *   operations.js   - decisionPathway, buildImplementationCalendar, supplierPortfolioAnalysis, contractPipeline, fundingConstraints, decisionPipeline, enrichedDecisionPipeline
 *   political.js    - meetingBriefing, politicalContext, politicalImpactAssessment, reformNarrativeEngine, electoralRippleAssessment (+ helpers)
 *   benchmarking.js - departmentOperationsProfile, processEfficiency, portfolioBenchmark, financialHealthAssessment, scoreImplementation, priorityMatrix
 *   governance.js   - generatePortfolioFOI, crossPortfolioDependencies, portfolioRiskDashboard
 *   directorate.js  - buildDirectorateSavingsProfile, evidenceChainStrength, directorateKPITracker, benchmarkDirectorate, directorateRiskProfile
 *   send.js         - sendCostProjection, earlyInterventionROI, lacPlacementOptimisation, sendServiceDirectives
 *   asc.js          - ascDemandProjection, ascMarketRisk, chcRecoveryModel, ascServiceDirectives
 *   crossCutting.js - quantifyDemandPressures, budgetRealismCheck, inspectionRemediationTimeline, netFiscalTrajectory, highwayAssetTrajectory, wasteDisposalComparison, assetServiceDirectives, fiscalSystemOverview, highwaysIntelligenceSummary
 *   serviceModels.js- childrenCostProjection, childrenServiceDirectives, publicHealthProjection, publicHealthDirectives, propertyEstateProjection, resourcesServiceDirectives
 *   expansion.js    - treasuryManagementSavings, feesAndChargesReview, workforceOptimisation, commercialisationPipeline
 *   soa.js          - bondPortfolioAnalysis, lossTrajectoryAnalysis, opaqueSpendingAnalysis, savingsDeliveryWeighting
 */

export * from './core.js'
export * from './spending.js'
export * from './directives.js'
export * from './playbook.js'
export * from './operations.js'
export * from './political.js'
export * from './benchmarking.js'
export * from './governance.js'
export * from './directorate.js'
export * from './send.js'
export * from './asc.js'
export * from './crossCutting.js'
export * from './serviceModels.js'
export * from './expansion.js'
export * from './soa.js'
